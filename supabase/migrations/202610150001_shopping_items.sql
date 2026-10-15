-- Authorization: the user's attached project specification explicitly states:
-- "the shared list is intentionally accessible to anyone who has access to the
-- deployed application and its public database configuration" and
-- "anyone with the public client credentials can potentially read or modify the list."
-- This file is a setup script only; it has not been executed against any database.
-- Anonymous grants below are limited to the requested shopping_items operations.
begin;
create table public.shopping_items (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120 and name = btrim(name) and name ~ '[^[:space:]]'),
  quantity numeric not null default 1 check (quantity > 0 and quantity <= 999999 and quantity = round(quantity, 3)),
  unit text not null default 'piece' check (unit in ('piece', 'g', 'kg', 'ml', 'l')),
  is_purchased boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create function public.touch_shopping_item() returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  new.created_at = old.created_at;
  return new;
end;
$$;
create trigger shopping_items_updated before update on public.shopping_items
  for each row execute function public.touch_shopping_item();
alter table public.shopping_items enable row level security;
revoke all on public.shopping_items from public, anon, authenticated;
grant usage on schema public to anon;
grant select, delete on public.shopping_items to anon;
grant insert (name, quantity, unit) on public.shopping_items to anon;
grant update (name, quantity, unit, is_purchased) on public.shopping_items to anon;
create policy "Prototype public read" on public.shopping_items for select to anon using (true);
create policy "Prototype public insert" on public.shopping_items for insert to anon with check (true);
create policy "Prototype public update" on public.shopping_items for update to anon using (true) with check (true);
create policy "Prototype public delete" on public.shopping_items for delete to anon using (true);
alter publication supabase_realtime add table public.shopping_items;
commit;
