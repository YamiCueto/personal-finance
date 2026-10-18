INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, phone_change, phone_change_token, reauthentication_token,
  raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous
)
VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'alice@localtest.dev',
   crypt('Test1234!', gen_salt('bf')), NOW(), NOW(), NOW(),
   '', '', '', '', '', '', '', '',
   '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, false, false),
  ('bbbbbbbb-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'bob@localtest.dev',
   crypt('Test1234!', gen_salt('bf')), NOW(), NOW(), NOW(),
   '', '', '', '', '', '', '', '',
   '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, false, false)
ON CONFLICT (id) DO UPDATE SET
  confirmation_token = '',
  recovery_token = '',
  email_change_token_new = '',
  email_change = '',
  email_change_token_current = '',
  phone_change = '',
  phone_change_token = '',
  reauthentication_token = '';

INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
VALUES
  (gen_random_uuid(), 'aaaaaaaa-0000-0000-0000-000000000001', 'alice@localtest.dev',
   json_build_object('sub', 'aaaaaaaa-0000-0000-0000-000000000001', 'email', 'alice@localtest.dev', 'email_verified', true)::jsonb,
   'email', NOW(), NOW(), NOW()),
  (gen_random_uuid(), 'bbbbbbbb-0000-0000-0000-000000000002', 'bob@localtest.dev',
   json_build_object('sub', 'bbbbbbbb-0000-0000-0000-000000000002', 'email', 'bob@localtest.dev', 'email_verified', true)::jsonb,
   'email', NOW(), NOW(), NOW())
ON CONFLICT (provider, provider_id) DO NOTHING;

SELECT u.id, u.email, i.provider
FROM auth.users u
JOIN auth.identities i ON i.user_id = u.id
WHERE u.email IN ('alice@localtest.dev', 'bob@localtest.dev');
