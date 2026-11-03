-- Creates (or resets) the admin login  demo@gatekeeper.com / 123456  and makes it an admin.
-- Run in the Supabase SQL Editor AFTER 0002_admin_services.sql. Safe to run more than once.
-- Change this password once you are live (Authentication -> Users -> ... -> Send password recovery / edit).
--
-- If this script errors on your project, create the user by hand instead:
--   Authentication -> Users -> Add user -> Create new user (email above, password above, tick "Auto Confirm User"),
--   then run only the last statement of this file.
do $$
declare
  uid uuid;
  v_email text := 'demo@gatekeeper.com';
  v_pass  text := '123456';
begin
  select id into uid from auth.users where email = v_email;
  if uid is null then
    uid := gen_random_uuid();
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) values (
      '00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', v_email,
      crypt(v_pass, gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''
    );
    insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), uid, uid::text, jsonb_build_object('sub', uid::text, 'email', v_email, 'email_verified', true), 'email', now(), now(), now());
  else
    update auth.users set encrypted_password = crypt(v_pass, gen_salt('bf')), email_confirmed_at = coalesce(email_confirmed_at, now()), updated_at = now() where id = uid;
  end if;
end $$;

insert into public.app_admins (user_id) select id from auth.users where email = 'demo@gatekeeper.com' on conflict do nothing;
