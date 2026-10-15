-- Read catalog state only; no household data or persistent schema is changed.
-- Emit only known migration versions whose complete changes were run manually.
begin;
create temporary table cart_manual_migrations(version text, applied boolean) on commit drop;
do $baseline$
declare tracked integer := 0; seen_pending boolean := false; migration record;
begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    execute 'select count(*) from supabase_migrations.schema_migrations where version in
      (''202610150001'',''202610150002'',''202610150003'',''202610160004'',''202610160005'',''202610160006'',''202610160007'')' into tracked;
    if tracked = 7 then return; end if;
  end if;
  insert into cart_manual_migrations values
    ('202610150001', to_regclass('public.shopping_items') is not null
      and to_regprocedure('public.touch_shopping_item()') is not null),
    ('202610150002', exists(select 1 from pg_constraint where conrelid=to_regclass('public.shopping_items')
      and conname='shopping_items_name_check' and position('120' in pg_get_constraintdef(oid))=0)),
    ('202610150003', to_regclass('cart_private.households') is not null
      and exists(select 1 from information_schema.columns where table_schema='public' and table_name='shopping_items' and column_name='household_id')
      and to_regprocedure('public.get_household()') is not null),
    ('202610160004', to_regclass('cart_private.household_sessions') is not null
      and to_regprocedure('public.login_household(text,text)') is not null
      and exists(select 1 from information_schema.columns where table_schema='cart_private' and table_name='households' and column_name='password_hash')),
    ('202610160005', to_regclass('cart_private.household_invites') is not null
      and to_regprocedure('public.create_household_invite()') is not null),
    ('202610160006', to_regprocedure('cart_private.hash_household_password(text)') is not null
      and to_regprocedure('cart_private.household_password_matches(text,text)') is not null),
    ('202610160007', to_regclass('cart_private.household_sessions') is not null
      and to_regclass('cart_private.household_invites') is not null
      and not exists(select 1 from information_schema.columns where table_schema='cart_private'
        and ((table_name in ('household_sessions','household_invites') and column_name='expires_at')
          or (table_name='households' and column_name='locked_until'))));
  for migration in select * from cart_manual_migrations order by version loop
    raise notice 'Historical migration %: %', migration.version, case when migration.applied then 'present' else 'pending' end;
  end loop;
  for migration in select * from cart_manual_migrations order by version loop
    -- Item-name validation is independent of household schema migrations. Some
    -- SQL-editor installations skipped it; db push --include-all fills this gap.
    if migration.version = '202610150002' then continue; end if;
    if not migration.applied then seen_pending := true;
    elsif seen_pending then
      raise exception 'Database changes do not match a complete migration prefix. Stop deployment and inspect the schema before repairing history.';
    end if;
  end loop;
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    execute 'delete from pg_temp.cart_manual_migrations where version in (select version from supabase_migrations.schema_migrations)';
  end if;
end;
$baseline$;
select version from cart_manual_migrations where applied order by version;
commit;
