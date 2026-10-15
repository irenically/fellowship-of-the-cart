-- Apply AFTER 202610150003_households.sql. Existing groceries stay in place.
-- Open an existing household's private link once to set its ID and password.
begin;
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

alter table cart_private.households
  add column slug text unique check (char_length(slug) between 3 and 64 and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  add column password_hash text,
  add column failed_attempts integer not null default 0,
  add column attempt_window timestamptz,
  add column locked_until timestamptz;

create table cart_private.household_sessions (
  secret_hash bytea primary key check (octet_length(secret_hash) = 32),
  household_id uuid not null references cart_private.households(id) on delete cascade,
  expires_at timestamptz not null default (now() + interval '30 days')
);
create index household_sessions_expiry on cart_private.household_sessions(expires_at);
alter table cart_private.household_sessions enable row level security;
revoke all on cart_private.household_sessions from public, anon, authenticated;

create or replace function cart_private.current_household() returns uuid
language sql stable security definer set search_path = '' as $$
  with credential as (
    select pg_catalog.sha256(pg_catalog.convert_to(
      coalesce(nullif(pg_catalog.current_setting('request.headers', true), '')::jsonb ->> 'x-household-key', ''), 'UTF8'
    )) as hash
  )
  select coalesce(
    (select s.household_id from cart_private.household_sessions s, credential c
      where s.secret_hash = c.hash and s.expires_at > now()),
    -- A legacy link only works until that household sets its first password.
    (select h.id from cart_private.households h, credential c
      where h.secret_hash = c.hash and h.password_hash is null)
  );
$$;

create function cart_private.household_details(p_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', id, 'name', name, 'slug', slug,
    'needs_password', password_hash is null)
  from cart_private.households where id = p_id;
$$;
revoke all on function cart_private.household_details(uuid) from public, anon, authenticated;

create function cart_private.valid_password(p_password text) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(char_length(p_password) >= 8 and octet_length(p_password) <= 72
    and p_password ~ '[^[:space:]]', false);
$$;
revoke all on function cart_private.valid_password(text) from public, anon, authenticated;

create function cart_private.issue_household_session(p_id uuid, p_secret text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_secret is null or p_secret !~ '^[a-f0-9]{64}$' then
    raise exception 'Invalid session key' using errcode = '22023';
  end if;
  -- A retry may renew its own token, but can never move another household's token.
  insert into cart_private.household_sessions(secret_hash, household_id)
    values (pg_catalog.sha256(pg_catalog.convert_to(p_secret, 'UTF8')), p_id)
    on conflict (secret_hash) do update set expires_at = now() + interval '30 days'
    where household_sessions.household_id = excluded.household_id;
  if not found then raise exception 'Invalid session key' using errcode = '22023'; end if;
  delete from cart_private.household_sessions where household_id = p_id and expires_at <= now();
end;
$$;
revoke all on function cart_private.issue_household_session(uuid, text) from public, anon, authenticated;

create or replace function public.get_household() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare result jsonb := cart_private.household_details(cart_private.current_household());
begin
  if result is null then raise exception 'Session expired' using errcode = '28000'; end if;
  return result;
end;
$$;

-- Disable the former link-only creation endpoint, including its PUBLIC grant.
revoke all on function public.create_household(text) from public, anon, authenticated;

create function public.create_household(p_name text, p_slug text, p_password text) returns jsonb
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
      and household.password_hash = extensions.crypt(p_password, household.password_hash) then
      return cart_private.household_details(household.id);
    end if;
    return jsonb_build_object('error', 'slug_taken');
  end if;
  insert into cart_private.households(name, slug, password_hash, secret_hash)
    values (btrim(p_name), p_slug, extensions.crypt(p_password, extensions.gen_salt('bf', 10)),
      pg_catalog.sha256(pg_catalog.convert_to(gen_random_uuid()::text || gen_random_uuid()::text, 'UTF8')))
    returning * into household;
  perform cart_private.issue_household_session(household.id, secret);
  return cart_private.household_details(household.id);
exception when unique_violation then return jsonb_build_object('error', 'slug_taken');
end;
$$;

create function public.login_household(p_slug text, p_password text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  secret text := coalesce(nullif(pg_catalog.current_setting('request.headers', true), '')::jsonb ->> 'x-household-key', '');
  household cart_private.households;
begin
  if secret !~ '^[a-f0-9]{64}$' then return jsonb_build_object('error', 'invalid_session'); end if;
  -- Bound password input before invoking bcrypt, including multibyte strings.
  if p_password is null or octet_length(p_password) > 72 then return jsonb_build_object('error', 'invalid_credentials'); end if;
  select * into household from cart_private.households where slug = lower(btrim(p_slug)) for update;
  if not found or household.password_hash is null then return jsonb_build_object('error', 'invalid_credentials'); end if;
  if household.locked_until > now() then return jsonb_build_object('error', 'rate_limited'); end if;
  if household.password_hash <> extensions.crypt(p_password, household.password_hash) then
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
  perform cart_private.issue_household_session(household.id, secret);
  return cart_private.household_details(household.id);
end;
$$;

create function public.set_household_password(p_slug text, p_password text, p_session_key text) returns jsonb
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
    password_hash = extensions.crypt(p_password, extensions.gen_salt('bf', 10)) where id = household.id;
  perform cart_private.issue_household_session(household.id, p_session_key);
  return cart_private.household_details(household.id);
exception when unique_violation then return jsonb_build_object('error', 'slug_taken');
end;
$$;

create function public.logout_household() returns void
language sql security definer set search_path = '' as $$
  delete from cart_private.household_sessions where secret_hash = pg_catalog.sha256(pg_catalog.convert_to(
    coalesce(nullif(pg_catalog.current_setting('request.headers', true), '')::jsonb ->> 'x-household-key', ''), 'UTF8'
  ));
$$;

revoke all on function public.create_household(text, text, text), public.login_household(text, text),
  public.set_household_password(text, text, text), public.logout_household() from public, anon, authenticated;
grant execute on function public.create_household(text, text, text), public.login_household(text, text),
  public.set_household_password(text, text, text), public.logout_household() to anon;
commit;
