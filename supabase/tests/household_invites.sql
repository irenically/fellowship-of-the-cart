-- Legacy expiry checks: disposable database after 005-006, before 007.
-- For the current permanent links, run permanent_household_access.sql.
begin;
set local role anon;
do $$ declare invite jsonb; result jsonb; credential text; begin
  perform set_config('request.headers',jsonb_build_object('x-household-key',repeat('a',64))::text,true);
  result := public.create_household('Invite home A','invite-home-a','fixture-password');
  if result ? 'error' then raise exception 'Setup failed'; end if;
  insert into public.shopping_items(name) values ('Invite home A groceries');
  invite := public.create_household_invite();
  credential := invite->>'credential';
  if invite->>'slug' <> 'invite-home-a' or credential !~ '^[a-f0-9]{64}$' then raise exception 'Invalid invite'; end if;
  perform set_config('cart_test.invite_credential',credential,true);
  -- An invite credential is not itself a signed-in browser session.
  perform set_config('request.headers',jsonb_build_object('x-household-key',credential)::text,true);
  if exists(select 1 from public.shopping_items) then raise exception 'Invite bypassed sign-in'; end if;
  begin perform public.create_household_invite(); raise exception 'Unauthenticated invite creation';
  exception when invalid_authorization_specification then null; end;
  perform set_config('request.headers',jsonb_build_object('x-household-key',repeat('b',64))::text,true);
  result := public.login_household('invite-home-a',credential);
  if result ? 'error' then raise exception 'Invite sign-in failed'; end if;
  if (select count(*) from public.shopping_items where name='Invite home A groceries') <> 1 then raise exception 'Invite opened wrong list'; end if;
  begin perform * from cart_private.household_invites; raise exception 'Invite hashes exposed';
  exception when insufficient_privilege then null; end;
  perform set_config('request.headers',jsonb_build_object('x-household-key',repeat('c',64))::text,true);
  result := public.create_household('Invite home B','invite-home-b','fixture-password');
  result := public.login_household('invite-home-b',credential);
  if result->>'error' <> 'invalid_credentials' then raise exception 'Cross-household invite accepted'; end if;
  if exists(select 1 from public.shopping_items) then raise exception 'Cross-household data exposed'; end if;
  perform set_config('request.headers',jsonb_build_object('x-household-key',repeat('a',64))::text,true);
  if (select count(*) from public.shopping_items) <> 1 then raise exception 'Sender session was changed'; end if;
end $$;
reset role;
update cart_private.household_invites set expires_at=now()-interval '1 second'
  where household_id=(select id from cart_private.households where slug='invite-home-a');
set local role anon;
do $$ declare result jsonb; begin
  perform set_config('request.headers',jsonb_build_object('x-household-key',repeat('d',64))::text,true);
  result := public.login_household('invite-home-a',current_setting('cart_test.invite_credential'));
  if result->>'error' <> 'invalid_credentials' then raise exception 'Expired invite accepted'; end if;
  result := public.login_household('invite-home-a','fixture-password');
  if result ? 'error' then raise exception 'Shared password no longer works'; end if;
end $$;
rollback;
