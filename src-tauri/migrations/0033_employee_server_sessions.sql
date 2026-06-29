ALTER TABLE server_auth_sessions
ADD COLUMN IF NOT EXISTS employee_id TEXT;

ALTER TABLE server_auth_sessions
ALTER COLUMN user_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_server_auth_sessions_employee_id
ON server_auth_sessions (employee_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'server_auth_sessions_employee_id_fkey'
  ) THEN
    ALTER TABLE server_auth_sessions
    ADD CONSTRAINT server_auth_sessions_employee_id_fkey
    FOREIGN KEY (employee_id) REFERENCES employees (id) ON DELETE CASCADE
    NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'server_auth_sessions_single_actor_check'
  ) THEN
    ALTER TABLE server_auth_sessions
    ADD CONSTRAINT server_auth_sessions_single_actor_check
    CHECK (
      ((user_id IS NOT NULL)::INTEGER + (employee_id IS NOT NULL)::INTEGER) = 1
    )
    NOT VALID;
  END IF;
END
$$;
