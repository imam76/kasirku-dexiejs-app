UPDATE auth_users
SET email = lower(regexp_replace(name, '\s+', '', 'g')) || '@frayukti.com'
WHERE email IS NULL OR trim(email) = '';
