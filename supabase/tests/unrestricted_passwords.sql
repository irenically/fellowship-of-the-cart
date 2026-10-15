-- Disposable database only, after migrations 001-006. Fixtures roll back.
begin;
-- A household created by the earlier password implementation must still work.
insert into cart_private.households(name,slug,secret_hash,password_hash) values
  ('Legacy bcrypt','legacy-bcrypt',sha256(convert_to(repeat('e',64),'UTF8')),
   extensions.crypt('old-fixture-password',extensions.gen_salt('bf',10)));
set local role anon;
do $$ declare result jsonb; long_password text := repeat('é🧙',1000); begin
  perform set_config('request.headers',jsonb_build_object('x-household-key',repeat('a',64))::text,true);
  result := public.create_household('Short password','short-password','x');
  if result ? 'error' then raise exception 'Single-character password rejected'; end if;
  perform set_config('request.headers',jsonb_build_object('x-household-key',repeat('b',64))::text,true);
  result := public.login_household('short-password','x');
  if result ? 'error' then raise exception 'Single-character login rejected'; end if;
  perform set_config('request.headers',jsonb_build_object('x-household-key',repeat('c',64))::text,true);
  result := public.create_household('Long password','long-password',long_password);
  if result ? 'error' then raise exception 'Long Unicode password rejected'; end if;
  perform set_config('request.headers',jsonb_build_object('x-household-key',repeat('d',64))::text,true);
  result := public.login_household('long-password',long_password || 'different ending');
  if result->>'error' <> 'invalid_credentials' then raise exception 'Long password truncated'; end if;
  result := public.login_household('long-password',long_password);
  if result ? 'error' then raise exception 'Long password login rejected'; end if;
  perform set_config('request.headers',jsonb_build_object('x-household-key',repeat('f',64))::text,true);
  result := public.create_household('Whitespace password','whitespace-password',' ');
  if result ? 'error' then raise exception 'Password composition restricted'; end if;
  result := public.login_household('whitespace-password','  ');
  if result->>'error' <> 'invalid_credentials' then raise exception 'Password whitespace trimmed'; end if;
  result := public.login_household('whitespace-password',' ');
  if result ? 'error' then raise exception 'Whitespace password login rejected'; end if;
  perform set_config('request.headers',jsonb_build_object('x-household-key',repeat('1',64))::text,true);
  result := public.login_household('legacy-bcrypt','old-fixture-password');
  if result ? 'error' then raise exception 'Existing household locked out'; end if;
end $$;
reset role;
do $$ begin
  if (select left(password_hash,8) from cart_private.households where slug='legacy-bcrypt') <> '{sha256}' then
    raise exception 'Legacy password not upgraded after login';
  end if;
end $$;
rollback;
