UPDATE auth_users
SET email = regexp_replace(email, '@kasirku\.com$', '@frayukti.com', 'i')
WHERE lower(email) LIKE '%@kasirku.com';

UPDATE auth_users
SET email = lower(regexp_replace(name, '\s+', '', 'g')) || '@frayukti.com'
WHERE email IS NULL OR trim(email) = '';
