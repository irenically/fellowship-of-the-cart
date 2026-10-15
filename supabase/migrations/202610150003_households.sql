-- Run once in the Supabase SQL editor. Save original_household_link from the
-- result BEFORE closing the editor: it is the only copy of the original list's
-- new private link. No existing groceries are deleted.
begin;

create schema cart_private;
revoke all on schema cart_private from public;
grant usage on schema cart_private to anon;
create table cart_private.households (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80 and name = btrim(name)),
  secret_hash bytea not null unique check (octet_length(secret_hash) = 32),
  created_at timestamptz not null default now()
);
alter table cart_private.households enable row level security;
revoke all on cart_private.households from public, anon, authenticated;

create function cart_private.current_household() returns uuid
language sql stable security definer set search_path = '' as $$
  select h.id from cart_private.households h
  where h.secret_hash = pg_catalog.sha256(pg_catalog.convert_to(
    coalesce(nullif(pg_catalog.current_setting('request.headers', true), '')::jsonb ->> 'x-household-key', ''), 'UTF8'
  ));
$$;
revoke all on function cart_private.current_household() from public, anon, authenticated;
grant execute on function cart_private.current_household() to anon;

create function public.create_household(p_name text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  secret text := coalesce(nullif(pg_catalog.current_setting('request.headers', true), '')::jsonb ->> 'x-household-key', '');
  household cart_private.households;
begin
  if secret !~ '^[a-f0-9]{64}$' then
    raise exception 'A valid household key is required' using errcode = '28000';
  end if;
  if p_name is null or char_length(btrim(p_name)) not between 1 and 80 then
    raise exception 'Use a household name between 1 and 80 characters' using errcode = '22023';
  end if;
  -- Retry-safe: the same private key can only create one household.
  insert into cart_private.households(name, secret_hash)
    values (btrim(p_name), pg_catalog.sha256(pg_catalog.convert_to(secret, 'UTF8')))
    on conflict (secret_hash) do nothing;
  select * into household from cart_private.households
    where secret_hash = pg_catalog.sha256(pg_catalog.convert_to(secret, 'UTF8'));
  return jsonb_build_object('id', household.id, 'name', household.name);
end;
$$;

create function public.get_household() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare household cart_private.households;
begin
  select * into household from cart_private.households
    where id = cart_private.current_household();
  if not found then
    raise exception 'Invalid household link' using errcode = '28000';
  end if;
  return jsonb_build_object('id', household.id, 'name', household.name);
end;
$$;
revoke all on function public.create_household(text) from public, anon, authenticated;
revoke all on function public.get_household() from public, anon, authenticated;
grant execute on function public.create_household(text), public.get_household() to anon;

-- Generate a private link for the existing list, without storing its plaintext
-- secret permanently or exposing a public "claim existing groceries" endpoint.
create temporary table original_household on commit preserve rows as
  select gen_random_uuid() as id,
    encode(pg_catalog.sha256(pg_catalog.convert_to(gen_random_uuid()::text || gen_random_uuid()::text, 'UTF8')), 'hex') as secret;
insert into cart_private.households(id, name, secret_hash)
  select id, 'Our household', pg_catalog.sha256(pg_catalog.convert_to(secret, 'UTF8')) from original_household;

alter table public.shopping_items add column household_id uuid references cart_private.households(id);
update public.shopping_items set household_id = (select id from original_household);
alter table public.shopping_items alter column household_id set not null;
alter table public.shopping_items alter column household_id set default cart_private.current_household();
create index shopping_items_household_created on public.shopping_items(household_id, created_at);

drop policy "Prototype public read" on public.shopping_items;
drop policy "Prototype public insert" on public.shopping_items;
drop policy "Prototype public update" on public.shopping_items;
drop policy "Prototype public delete" on public.shopping_items;
create policy "Household read" on public.shopping_items for select to anon
  using (household_id = (select cart_private.current_household()));
create policy "Household insert" on public.shopping_items for insert to anon
  with check (household_id = (select cart_private.current_household()));
create policy "Household update" on public.shopping_items for update to anon
  using (household_id = (select cart_private.current_household()))
  with check (household_id = (select cart_private.current_household()));
create policy "Household delete" on public.shopping_items for delete to anon
  using (household_id = (select cart_private.current_household()));

-- No client can assign an item to another household. Existing column grants
-- exclude household_id; its default is derived from the checked request secret.
-- HTTP household headers do not authenticate Realtime sockets. Use scoped HTTP
-- polling instead, and remove the former unscoped publication membership.
do $$ begin
  if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'shopping_items') then
    alter publication supabase_realtime drop table public.shopping_items;
  end if;
end $$;

commit;
-- Keep this SELECT last so the SQL editor displays the private link as a result.
-- The temporary table is visible only to this SQL-editor database session.
select 'https://irenically.github.io/fellowship-of-the-cart/#household=' || secret as original_household_link
  from original_household;
