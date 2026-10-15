-- Run against a disposable database AFTER the migrations. All fixtures roll back.
begin;
set local role anon;
select set_config('request.headers', '{"x-household-key":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}', true);
select public.create_household('Household A');
select public.create_household('Retry must not rename A');
insert into public.shopping_items(name, quantity, unit) values ('Isolation fixture A', 1, 'piece');
do $$ begin
  if (select public.get_household()->>'name') <> 'Household A' then raise exception 'Creation retry was not idempotent'; end if;
  if (select count(*) from public.shopping_items) <> 1 then raise exception 'Household A cannot see its item'; end if;
end $$;

select set_config('request.headers', '{"x-household-key":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}', true);
select public.create_household('Household B');
do $$ begin
  if exists (select 1 from public.shopping_items) then raise exception 'Household B can read A'; end if;
  update public.shopping_items set name = 'Cross-household edit';
  if found then raise exception 'Household B can edit A'; end if;
  delete from public.shopping_items;
  if found then raise exception 'Household B can delete A'; end if;
  begin
    insert into public.shopping_items(name, household_id)
      values ('Cross-household insert', gen_random_uuid());
    raise exception 'Client can explicitly assign a household';
  exception when insufficient_privilege then null;
  end;
  begin
    perform * from cart_private.households;
    raise exception 'Client can list household credentials';
  exception when insufficient_privilege then null;
  end;
end $$;
insert into public.shopping_items(name, quantity, unit) values ('Isolation fixture B', 2, 'kg');
update public.shopping_items set is_purchased = true;
delete from public.shopping_items where is_purchased;
do $$ begin
  if exists (select 1 from public.shopping_items) then raise exception 'Clear did not remove own gathered items'; end if;
end $$;

-- No header and unknown links must fail closed, with no data or write access.
select set_config('request.headers', '{}', true);
do $$ begin
  if exists (select 1 from public.shopping_items) then raise exception 'No-key read bypass'; end if;
  delete from public.shopping_items;
  if found then raise exception 'No-key delete bypass'; end if;
  begin
    perform public.get_household();
    raise exception 'No-key household lookup bypass';
  exception when invalid_authorization_specification then null;
  end;
  begin
    insert into public.shopping_items(name) values ('No-key insert');
    raise exception 'No-key insert bypass';
  exception when insufficient_privilege or not_null_violation then null;
  end;
end $$;
select set_config('request.headers', '{"x-household-key":"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"}', true);
do $$ begin
  if exists (select 1 from public.shopping_items) then raise exception 'Unknown-key read bypass'; end if;
  begin
    perform public.get_household();
    raise exception 'Unknown-key household lookup bypass';
  exception when invalid_authorization_specification then null;
  end;
end $$;

-- Independent device with A's link still sees the original, unmodified item.
select set_config('request.headers', '{"x-household-key":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}', true);
do $$ begin
  if (select count(*) from public.shopping_items where name = 'Isolation fixture A') <> 1 then
    raise exception 'Other household operations damaged A';
  end if;
end $$;
rollback;
