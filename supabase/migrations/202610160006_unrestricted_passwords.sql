-- Apply after migration 005. No password length or complexity policy; a value
-- is still required. Prehash the FULL password before bcrypt to avoid its
-- 72-byte truncation. Existing bcrypt hashes continue to work and upgrade on login.
begin;
create or replace function cart_private.valid_password(p_password text) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(char_length(p_password) > 0, false);
$$;
create function cart_private.hash_household_password(p_password text) returns text
language sql set search_path = '' as $$
  select '{sha256}' || extensions.crypt(
    encode(pg_catalog.sha256(pg_catalog.convert_to(p_password,'UTF8')), 'hex'),
    extensions.gen_salt('bf',10));
$$;
create function cart_private.household_password_matches(p_password text, p_hash text) returns boolean
language plpgsql set search_path = '' as $$
begin
  if p_password is null or p_password = '' or p_hash is null then return false; end if;
  if left(p_hash,8) = '{sha256}' then
    return substring(p_hash from 9) = extensions.crypt(
      encode(pg_catalog.sha256(pg_catalog.convert_to(p_password,'UTF8')), 'hex'), substring(p_hash from 9));
  end if;
  -- Never silently truncate a password when checking an older, untagged hash.
  if octet_length(p_password) > 72 then return false; end if;
  return p_hash = extensions.crypt(p_password, p_hash);
end;
$$;
revoke all on function cart_private.hash_household_password(text),
  cart_private.household_password_matches(text,text) from public, anon, authenticated;

create or replace function public.create_household(p_name text, p_slug text, p_password text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  secret text := coalesce(nullif(pg_catalog.current_setting('request.headers', true), '')::jsonb ->> 'x-household-key', '');
  household cart_private.households;
begin
  if secret !~ '^[a-f0-9]{64}$' then return jsonb_build_object('error', 'invalid_session'); end if;
  if p_name is null or char_length(btrim(p_name)) not between 1 and 80 then return jsonb_build_object('error', 'invalid_name'); end if;
  if p_slug is null or char_length(p_slug) not between 3 and 64 or p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then return jsonb_build_object('error', 'invalid_slug'); end if;
  if not cart_private.valid_password(p_password) then return jsonb_build_object('error', 'invalid_password'); end if;
  select * into household from cart_private.households where slug = p_slug;
  if found then
    -- Retrying a successful create after a lost response is safe and idempotent.
    if exists (select 1 from cart_private.household_sessions where household_id = household.id
      and secret_hash = pg_catalog.sha256(pg_catalog.convert_to(secret, 'UTF8')) and expires_at > now())
      and cart_private.household_password_matches(p_password, household.password_hash) then
      return cart_private.household_details(household.id);
    end if;
    return jsonb_build_object('error', 'slug_taken');
  end if;
  insert into cart_private.households(name, slug, password_hash, secret_hash)
    values (btrim(p_name), p_slug, cart_private.hash_household_password(p_password),
      pg_catalog.sha256(pg_catalog.convert_to(gen_random_uuid()::text || gen_random_uuid()::text, 'UTF8')))
    returning * into household;
  perform cart_private.issue_household_session(household.id, secret);
  return cart_private.household_details(household.id);
exception when unique_violation then return jsonb_build_object('error', 'slug_taken');
end;
$$;

create or replace function public.login_household(p_slug text, p_password text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  secret text := coalesce(nullif(pg_catalog.current_setting('request.headers', true), '')::jsonb ->> 'x-household-key', '');
  household cart_private.households;
begin
  if secret !~ '^[a-f0-9]{64}$' then return jsonb_build_object('error', 'invalid_session'); end if;
  if p_password is null or p_password = '' then return jsonb_build_object('error', 'invalid_credentials'); end if;
  select * into household from cart_private.households where slug = lower(btrim(p_slug)) for update;
  if not found or household.password_hash is null then return jsonb_build_object('error', 'invalid_credentials'); end if;
  if household.locked_until > now() then return jsonb_build_object('error', 'rate_limited'); end if;
  if not exists (
    select 1 from cart_private.household_invites i where i.household_id = household.id
      and i.secret_hash = pg_catalog.sha256(pg_catalog.convert_to(p_password, 'UTF8')) and i.expires_at > now()
  ) and not cart_private.household_password_matches(p_password, household.password_hash) then
    if household.attempt_window is null or household.attempt_window < now() - interval '5 minutes' then
      household.failed_attempts := 0;
      household.attempt_window := now();
    end if;
    update cart_private.households set
      failed_attempts = household.failed_attempts + 1,
      attempt_window = household.attempt_window,
      locked_until = case when household.failed_attempts + 1 >= 8 then now() + interval '1 minute' else null end
      where id = household.id;
    -- Return a result instead of raising: failed-attempt counters must commit.
    return jsonb_build_object('error', case when household.failed_attempts + 1 >= 8 then 'rate_limited' else 'invalid_credentials' end);
  end if;
  update cart_private.households set failed_attempts = 0, attempt_window = null, locked_until = null where id = household.id;
  if left(household.password_hash,8) <> '{sha256}' and cart_private.household_password_matches(p_password, household.password_hash) then
    update cart_private.households set password_hash = cart_private.hash_household_password(p_password) where id = household.id;
  end if;
  perform cart_private.issue_household_session(household.id, secret);
  return cart_private.household_details(household.id);
end;
$$;

create or replace function public.set_household_password(p_slug text, p_password text, p_session_key text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  household cart_private.households;
  old_secret text := coalesce(nullif(pg_catalog.current_setting('request.headers', true), '')::jsonb ->> 'x-household-key', '');
begin
  select * into household from cart_private.households where id = cart_private.current_household() for update;
  if not found then return jsonb_build_object('error', 'invalid_session'); end if;
  if household.password_hash is not null then return jsonb_build_object('error', 'already_setup'); end if;
  if p_session_key is null or p_session_key !~ '^[a-f0-9]{64}$' or p_session_key = old_secret then return jsonb_build_object('error', 'invalid_session'); end if;
  if p_slug is null or char_length(p_slug) not between 3 and 64 or p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then return jsonb_build_object('error', 'invalid_slug'); end if;
  if not cart_private.valid_password(p_password) then return jsonb_build_object('error', 'invalid_password'); end if;
  update cart_private.households set slug = p_slug,
    password_hash = cart_private.hash_household_password(p_password) where id = household.id;
  perform cart_private.issue_household_session(household.id, p_session_key);
  return cart_private.household_details(household.id);
exception when unique_violation then return jsonb_build_object('error', 'slug_taken');
end;
$$;

commit;
