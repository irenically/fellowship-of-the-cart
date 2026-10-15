-- Legacy lifecycle checks: disposable database after 004-006, before 007.
-- For permanent access, run permanent_household_access.sql and unrestricted_passwords.sql.
begin;
-- Simulate an existing link-based household with groceries to preserve.
insert into cart_private.households(id, name, secret_hash) values
  ('00000000-0000-0000-0000-000000000004', 'Legacy home', sha256(convert_to(repeat('e',64), 'UTF8')));
insert into public.shopping_items(name, household_id) values ('Legacy groceries', '00000000-0000-0000-0000-000000000004');
set local role anon;
select set_config('request.headers', jsonb_build_object('x-household-key',repeat('a',64))::text, true);
do $$ declare result jsonb; begin
  result := public.create_household('My Household', 'my-household', 'fixture-password');
  if result->>'slug' <> 'my-household' or result ? 'error' then raise exception 'Creation failed: %',result; end if;
  result := public.create_household('Retry must not rename', 'my-household', 'fixture-password');
  if result->>'name' <> 'My Household' then raise exception 'Create retry is not idempotent'; end if;
  insert into public.shopping_items(name) values ('Home A milk');
  begin
    perform public.create_household('Old unauthenticated endpoint');
    raise exception 'Link-only creation still allowed';
  exception when insufficient_privilege then null; end;
end $$;

select set_config('request.headers', jsonb_build_object('x-household-key',repeat('b',64))::text, true);
do $$ declare result jsonb; begin
  result := public.login_household('my-household', 'incorrect-password');
  if result->>'error' <> 'invalid_credentials' then raise exception 'Wrong password accepted'; end if;
  if exists(select 1 from public.shopping_items) then raise exception 'Failed login granted data access'; end if;
  result := public.create_household('Another household', 'my-household', 'fixture-password');
  if result->>'error' <> 'slug_taken' then raise exception 'Duplicate ID accepted'; end if;
  result := public.login_household(' MY-HOUSEHOLD ', 'fixture-password');
  if result->>'slug' <> 'my-household' then raise exception 'Sign-in failed'; end if;
  if (select count(*) from public.shopping_items where name = 'Home A milk') <> 1 then raise exception 'Second member cannot see same groceries'; end if;
  update public.shopping_items set quantity = 2;
end $$;

select set_config('request.headers', jsonb_build_object('x-household-key',repeat('c',64))::text, true);
do $$ declare result jsonb; begin
  result := public.create_household('Home B', 'home-b', 'another-fixture-password');
  if result ? 'error' then raise exception 'Second household creation failed'; end if;
  if exists(select 1 from public.shopping_items) then raise exception 'Cross-household read'; end if;
  update public.shopping_items set name = 'Cross-household edit';
  if found then raise exception 'Cross-household update'; end if;
  delete from public.shopping_items;
  if found then raise exception 'Cross-household delete'; end if;
  begin
    insert into public.shopping_items(name,household_id) values ('Cross-household insert',gen_random_uuid());
    raise exception 'Client can assign household_id';
  exception when insufficient_privilege then null; end;
  begin
    perform * from cart_private.households;
    raise exception 'Password hashes are exposed';
  exception when insufficient_privilege then null; end;
  begin
    perform * from cart_private.household_sessions;
    raise exception 'Session hashes are exposed';
  exception when insufficient_privilege then null; end;
  insert into public.shopping_items(name) values ('Home B bread');
  update public.shopping_items set is_purchased = true;
  delete from public.shopping_items where is_purchased;
  if exists(select 1 from public.shopping_items) then raise exception 'Own clear failed'; end if;
end $$;

-- A different member's logout must not revoke the original member's session.
select set_config('request.headers', jsonb_build_object('x-household-key',repeat('b',64))::text, true);
select public.logout_household();
do $$ begin
  if exists(select 1 from public.shopping_items) then raise exception 'Signed-out session still reads'; end if;
  begin perform public.get_household(); raise exception 'Signed-out session still works';
  exception when invalid_authorization_specification then null; end;
end $$;
select set_config('request.headers', jsonb_build_object('x-household-key',repeat('a',64))::text, true);
do $$ begin
  if (select quantity from public.shopping_items where name = 'Home A milk') <> 2 then raise exception 'Other member edit missing or session revoked'; end if;
end $$;

-- Failed counters commit because login returns a result instead of raising.
select set_config('request.headers', jsonb_build_object('x-household-key',repeat('d',64))::text, true);
do $$ declare result jsonb; begin
  for attempt in 1..8 loop result := public.login_household('my-household', 'wrong-password'); end loop;
  if result->>'error' <> 'rate_limited' then raise exception 'Login attempts not limited'; end if;
  result := public.login_household('my-household', 'fixture-password');
  if result->>'error' <> 'rate_limited' then raise exception 'Lockout bypass'; end if;
  result := public.login_household('does-not-exist', 'fixture-password');
  if result->>'error' <> 'invalid_credentials' then raise exception 'Unknown ID differs from wrong password'; end if;
  result := public.create_household('Missing password', 'missing-password', '');
  if result->>'error' <> 'invalid_password' then raise exception 'Empty password accepted'; end if;
end $$;
reset role;
do $$ begin
  if (select failed_attempts from cart_private.households where slug='my-household') <> 8 then raise exception 'Failed attempt counters rolled back'; end if;
  if exists(select 1 from cart_private.households where password_hash is not null and password_hash !~ '^(\{sha256\})?\$2a\$10\$') then raise exception 'Password not bcrypt hashed'; end if;
end $$;
update cart_private.households set locked_until=now()-interval '1 second', attempt_window=now()-interval '6 minutes' where slug='my-household';
update cart_private.household_sessions set expires_at=now()-interval '1 second' where secret_hash=sha256(convert_to(repeat('a',64),'UTF8'));
set local role anon;
select set_config('request.headers', jsonb_build_object('x-household-key',repeat('a',64))::text, true);
do $$ begin
  if exists(select 1 from public.shopping_items) then raise exception 'Expired session still reads'; end if;
end $$;
select set_config('request.headers', jsonb_build_object('x-household-key',repeat('d',64))::text, true);
do $$ declare result jsonb; begin
  result:=public.login_household('my-household','fixture-password');
  if result ? 'error' then raise exception 'Login failed after lock expired'; end if;
end $$;

-- Convert a legacy household in place; the old invite is revoked, new session works.
select set_config('request.headers', jsonb_build_object('x-household-key',repeat('e',64))::text, true);
do $$ declare result jsonb; begin
  if (public.get_household()->>'needs_password')::boolean is not true then raise exception 'Legacy household not marked for setup'; end if;
  result:=public.set_household_password('legacy-home','legacy-fixture-password',repeat('f',64));
  if result ? 'error' then raise exception 'Legacy password setup failed: %',result; end if;
  if exists(select 1 from public.shopping_items) then raise exception 'Old invite remains valid after password setup'; end if;
end $$;
select set_config('request.headers', jsonb_build_object('x-household-key',repeat('f',64))::text, true);
do $$ begin
  if (select count(*) from public.shopping_items where name='Legacy groceries') <> 1 then raise exception 'Legacy groceries lost'; end if;
end $$;
select set_config('request.headers','{}',true);
do $$ begin
  if exists(select 1 from public.shopping_items) then raise exception 'No-session read bypass'; end if;
  begin insert into public.shopping_items(name) values ('Anonymous insert'); raise exception 'No-session insert bypass';
  exception when insufficient_privilege or not_null_violation then null; end;
end $$;
rollback;
