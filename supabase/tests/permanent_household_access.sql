-- Disposable database only, after migrations 001-007. Fixtures roll back.
begin;
do $$ begin
  if exists(select 1 from information_schema.columns where table_schema='cart_private'
    and table_name in ('household_sessions','household_invites') and column_name='expires_at') then
    raise exception 'Expiration is still configured';
  end if;
end $$;
set local role anon;
do $$ declare result jsonb; invite jsonb; credential text; begin
  perform set_config('request.headers',jsonb_build_object('x-household-key',repeat('a',64))::text,true);
  result := public.create_household('Permanent home','permanent-home','x');
  if result ? 'error' then raise exception 'Household creation failed'; end if;
  result := public.create_household('Retry','permanent-home','x');
  if result->>'name' <> 'Permanent home' then raise exception 'Creation retry failed'; end if;
  insert into public.shopping_items(name) values ('Permanent groceries');
  invite := public.create_household_invite(); credential := invite->>'credential';
  if credential !~ '^[a-f0-9]{64}$' then raise exception 'Invite creation failed'; end if;
  perform public.logout_household();
  if exists(select 1 from public.shopping_items) then raise exception 'Sign-out did not revoke sender session'; end if;
  perform set_config('request.headers',jsonb_build_object('x-household-key',repeat('b',64))::text,true);
  result := public.login_household('permanent-home',credential);
  if result ? 'error' then raise exception 'Sender sign-out invalidated invite'; end if;
  if (select count(*) from public.shopping_items) <> 1 then raise exception 'Invite opened wrong list'; end if;
  perform public.logout_household();
  perform set_config('request.headers',jsonb_build_object('x-household-key',repeat('c',64))::text,true);
  result := public.login_household('permanent-home',credential);
  if result ? 'error' then raise exception 'Invite is not reusable'; end if;
  for attempt in 1..10 loop result := public.login_household('permanent-home','wrong-password'); end loop;
  result := public.login_household('permanent-home','x');
  if result ? 'error' then raise exception 'Unrequested login lockout remains'; end if;
  perform set_config('request.headers',jsonb_build_object('x-household-key',repeat('d',64))::text,true);
  result := public.create_household('Other permanent home','other-permanent-home','x');
  result := public.login_household('other-permanent-home',credential);
  if result->>'error' <> 'invalid_credentials' then raise exception 'Invite crosses households'; end if;
  if exists(select 1 from public.shopping_items) then raise exception 'Other household can read groceries'; end if;
  begin perform * from cart_private.household_invites; raise exception 'Private invite hashes exposed';
  exception when insufficient_privilege then null; end;
  perform set_config('request.headers','{}',true);
  begin perform public.create_household_invite(); raise exception 'Anonymous invite creation';
  exception when invalid_authorization_specification then null; end;
end $$;
rollback;
