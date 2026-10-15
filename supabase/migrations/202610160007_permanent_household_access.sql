-- Apply after migration 006. Links and remembered sign-ins do not expire.
begin;
create or replace function cart_private.current_household() returns uuid
language sql stable security definer set search_path = '' as $$
  with credential as (
    select pg_catalog.sha256(pg_catalog.convert_to(
      coalesce(nullif(pg_catalog.current_setting('request.headers', true), '')::jsonb ->> 'x-household-key', ''), 'UTF8'
    )) as hash
  )
  select coalesce(
    (select s.household_id from cart_private.household_sessions s, credential c where s.secret_hash = c.hash),
    (select h.id from cart_private.households h, credential c where h.secret_hash = c.hash and h.password_hash is null)
  );
$$;
create or replace function cart_private.issue_household_session(p_id uuid, p_secret text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_secret is null or p_secret !~ '^[a-f0-9]{64}$' then
    raise exception 'Invalid session key' using errcode = '22023';
  end if;
  insert into cart_private.household_sessions(secret_hash, household_id)
    values (pg_catalog.sha256(pg_catalog.convert_to(p_secret, 'UTF8')), p_id)
    on conflict (secret_hash) do nothing;
  if not found and not exists (select 1 from cart_private.household_sessions
    where secret_hash = pg_catalog.sha256(pg_catalog.convert_to(p_secret,'UTF8')) and household_id = p_id) then
    raise exception 'Invalid session key' using errcode = '22023';
  end if;
end;
$$;
create or replace function public.get_household() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare result jsonb := cart_private.household_details(cart_private.current_household());
begin
  if result is null then raise exception 'Invalid household sign-in' using errcode = '28000'; end if;
  return result;
end;
$$;
create or replace function public.create_household_invite() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  household cart_private.households;
  credential text := encode(extensions.gen_random_bytes(32), 'hex');
begin
  select * into household from cart_private.households
    where id = cart_private.current_household() and password_hash is not null;
  if not found then raise exception 'Invalid household sign-in' using errcode = '28000'; end if;
  insert into cart_private.household_invites(secret_hash, household_id)
    values (pg_catalog.sha256(pg_catalog.convert_to(credential, 'UTF8')), household.id);
  return jsonb_build_object('slug', household.slug, 'credential', credential);
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
  select * into household from cart_private.households where slug = lower(btrim(p_slug));
  if not found or household.password_hash is null then return jsonb_build_object('error', 'invalid_credentials'); end if;
  if not exists (select 1 from cart_private.household_invites i where i.household_id = household.id
    and i.secret_hash = pg_catalog.sha256(pg_catalog.convert_to(p_password,'UTF8')))
    and not cart_private.household_password_matches(p_password,household.password_hash) then
    return jsonb_build_object('error', 'invalid_credentials');
  end if;
  if left(household.password_hash,8) <> '{sha256}' and cart_private.household_password_matches(p_password,household.password_hash) then
    update cart_private.households set password_hash = cart_private.hash_household_password(p_password) where id = household.id;
  end if;
  perform cart_private.issue_household_session(household.id, secret);
  return cart_private.household_details(household.id);
end;
$$;

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
      and secret_hash = pg_catalog.sha256(pg_catalog.convert_to(secret, 'UTF8')))
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

alter table cart_private.household_sessions drop column expires_at;
alter table cart_private.household_invites drop column expires_at;
alter table cart_private.households drop column failed_attempts, drop column attempt_window, drop column locked_until;
commit;
