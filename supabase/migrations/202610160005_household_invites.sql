-- Apply after migration 004. Invites use the existing session, not the password.
begin;
create table cart_private.household_invites (
  secret_hash bytea primary key check (octet_length(secret_hash) = 32),
  household_id uuid not null references cart_private.households(id) on delete cascade,
  expires_at timestamptz not null default (now() + interval '30 days')
);
create index household_invites_expiry on cart_private.household_invites(expires_at);
alter table cart_private.household_invites enable row level security;
revoke all on cart_private.household_invites from public, anon, authenticated;
create function public.create_household_invite() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  household cart_private.households;
  credential text := encode(extensions.gen_random_bytes(32), 'hex');
begin
  select * into household from cart_private.households
    where id = cart_private.current_household() and password_hash is not null;
  if not found then raise exception 'Session expired' using errcode = '28000'; end if;
  delete from cart_private.household_invites where household_id = household.id and expires_at <= now();
  insert into cart_private.household_invites(secret_hash, household_id)
    values (pg_catalog.sha256(pg_catalog.convert_to(credential, 'UTF8')), household.id);
  return jsonb_build_object('slug', household.slug, 'credential', credential);
end;
$$;
revoke all on function public.create_household_invite() from public, anon, authenticated;
grant execute on function public.create_household_invite() to anon;

create or replace function public.login_household(p_slug text, p_password text) returns jsonb
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
  if not exists (
    select 1 from cart_private.household_invites i where i.household_id = household.id
      and i.secret_hash = pg_catalog.sha256(pg_catalog.convert_to(p_password, 'UTF8')) and i.expires_at > now()
  ) and household.password_hash <> extensions.crypt(p_password, household.password_hash) then
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

commit;
