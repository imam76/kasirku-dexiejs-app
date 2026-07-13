CREATE TABLE IF NOT EXISTS server_auth_sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES auth_users (id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_active_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_server_auth_sessions_user_id
ON server_auth_sessions (user_id);

CREATE INDEX IF NOT EXISTS idx_server_auth_sessions_expires_at
ON server_auth_sessions (expires_at);

CREATE TABLE IF NOT EXISTS cooperative_posting_accounts (
    id TEXT PRIMARY KEY,
    account_key TEXT,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    account_type TEXT NOT NULL,
    is_postable BOOLEAN NOT NULL,
    is_active BOOLEAN NOT NULL,
    is_cash_or_bank BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at TIMESTAMPTZ NOT NULL,
    updated_by TEXT,
    CONSTRAINT cooperative_posting_accounts_type_check
      CHECK (account_type IN ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'CONTRA_REVENUE', 'EXPENSE'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cooperative_posting_accounts_key
ON cooperative_posting_accounts (account_key)
WHERE account_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS cooperative_payment_policy (
    id TEXT PRIMARY KEY,
    max_backdate_days INTEGER NOT NULL DEFAULT 7,
    max_future_minutes INTEGER NOT NULL DEFAULT 5,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by TEXT,
    CONSTRAINT cooperative_payment_policy_backdate_check CHECK (max_backdate_days BETWEEN 0 AND 366),
    CONSTRAINT cooperative_payment_policy_future_check CHECK (max_future_minutes BETWEEN 0 AND 1440)
);

INSERT INTO cooperative_payment_policy (id)
VALUES ('default')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE cooperative_loan_payments
ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_cooperative_loan_payments_idempotency_key
ON cooperative_loan_payments (idempotency_key)
WHERE idempotency_key IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT payment_number
    FROM cooperative_loan_payments
    GROUP BY payment_number
    HAVING COUNT(*) > 1
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS idx_cooperative_loan_payments_payment_number_unique
    ON cooperative_loan_payments (payment_number);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.cooperative_loan_payments'::regclass
      AND conname = 'cooperative_loan_payments_positive_amount_check'
  ) THEN
    ALTER TABLE cooperative_loan_payments
    ADD CONSTRAINT cooperative_loan_payments_positive_amount_check
    CHECK (
      amount > 0 AND
      principal_amount >= 0 AND
      interest_amount >= 0 AND
      penalty_amount >= 0 AND
      ABS(amount - principal_amount - interest_amount - penalty_amount) <= 0.01
    ) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.cooperative_loan_payments'::regclass
      AND conname = 'cooperative_loan_payments_status_check'
  ) THEN
    ALTER TABLE cooperative_loan_payments
    ADD CONSTRAINT cooperative_loan_payments_status_check
    CHECK (status IN ('POSTED', 'REVERSED')) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.cooperative_loan_payments'::regclass
      AND conname = 'cooperative_loan_payments_type_check'
  ) THEN
    ALTER TABLE cooperative_loan_payments
    ADD CONSTRAINT cooperative_loan_payments_type_check
    CHECK (COALESCE(payment_type, 'PAYMENT') IN ('PAYMENT', 'REVERSAL')) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.cooperative_loan_payments'::regclass
      AND conname = 'cooperative_loan_payments_loan_fk'
  ) THEN
    ALTER TABLE cooperative_loan_payments
    ADD CONSTRAINT cooperative_loan_payments_loan_fk
    FOREIGN KEY (loan_id) REFERENCES cooperative_loans (id) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.cooperative_loan_payments'::regclass
      AND conname = 'cooperative_loan_payments_installment_fk'
  ) THEN
    ALTER TABLE cooperative_loan_payments
    ADD CONSTRAINT cooperative_loan_payments_installment_fk
    FOREIGN KEY (installment_id) REFERENCES cooperative_loan_installments (id) NOT VALID;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT reversal_of_payment_id
    FROM cooperative_loan_payments
    WHERE reversal_of_payment_id IS NOT NULL
    GROUP BY reversal_of_payment_id
    HAVING COUNT(*) > 1
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS idx_cooperative_payment_single_reversal
    ON cooperative_loan_payments (reversal_of_payment_id)
    WHERE reversal_of_payment_id IS NOT NULL;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.cooperative_loan_installments'::regclass
      AND conname = 'cooperative_loan_installments_paid_amount_check'
  ) THEN
    ALTER TABLE cooperative_loan_installments
    ADD CONSTRAINT cooperative_loan_installments_paid_amount_check
    CHECK (
      paid_principal_amount >= 0 AND
      paid_interest_amount >= 0 AND
      paid_penalty_amount >= 0
    ) NOT VALID;
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS cooperative_loan_collection_events (
    id TEXT PRIMARY KEY,
    installment_id TEXT NOT NULL,
    loan_id TEXT NOT NULL,
    loan_number TEXT NOT NULL,
    member_id TEXT NOT NULL,
    member_number TEXT NOT NULL,
    member_name TEXT NOT NULL,
    collection_status TEXT NOT NULL,
    follow_up_date TIMESTAMPTZ,
    collection_notes TEXT NOT NULL,
    contacted_at TIMESTAMPTZ NOT NULL,
    actor_user_id TEXT,
    actor_user_name TEXT,
    actor_employee_id TEXT,
    created_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT cooperative_collection_event_status_check
      CHECK (collection_status IN ('PROMISED_TO_PAY', 'UNABLE_TO_PAY', 'FOLLOW_UP')),
    CONSTRAINT cooperative_collection_event_notes_check
      CHECK (LENGTH(BTRIM(collection_notes)) >= 3)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.cooperative_loan_collection_events'::regclass
      AND conname = 'cooperative_collection_events_installment_fk'
  ) THEN
    ALTER TABLE cooperative_loan_collection_events
    ADD CONSTRAINT cooperative_collection_events_installment_fk
    FOREIGN KEY (installment_id) REFERENCES cooperative_loan_installments (id) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.cooperative_loan_collection_events'::regclass
      AND conname = 'cooperative_collection_events_loan_fk'
  ) THEN
    ALTER TABLE cooperative_loan_collection_events
    ADD CONSTRAINT cooperative_collection_events_loan_fk
    FOREIGN KEY (loan_id) REFERENCES cooperative_loans (id) NOT VALID;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_cooperative_collection_events_installment_id
ON cooperative_loan_collection_events (installment_id);

CREATE INDEX IF NOT EXISTS idx_cooperative_collection_events_loan_id
ON cooperative_loan_collection_events (loan_id);

CREATE INDEX IF NOT EXISTS idx_cooperative_collection_events_contacted_at
ON cooperative_loan_collection_events (contacted_at);

INSERT INTO cooperative_loan_collection_events (
    id,
    installment_id,
    loan_id,
    loan_number,
    member_id,
    member_number,
    member_name,
    collection_status,
    follow_up_date,
    collection_notes,
    contacted_at,
    created_at
)
SELECT
    'legacy-' || installment.id || '-' || MD5(
      COALESCE(installment.last_contacted_at, installment.updated_at::TEXT) ||
      COALESCE(installment.collection_status, 'NONE')
    ),
    installment.id,
    installment.loan_id,
    installment.loan_number,
    installment.member_id,
    installment.member_number,
    installment.member_name,
    installment.collection_status,
    NULLIF(installment.follow_up_date, '')::TIMESTAMPTZ,
    installment.collection_notes,
    COALESCE(
      NULLIF(installment.last_contacted_at, '')::TIMESTAMPTZ,
      installment.updated_at
    ),
    COALESCE(
      NULLIF(installment.last_contacted_at, '')::TIMESTAMPTZ,
      installment.updated_at
    )
FROM cooperative_loan_installments AS installment
WHERE installment.collection_status IN ('PROMISED_TO_PAY', 'UNABLE_TO_PAY', 'FOLLOW_UP')
  AND LENGTH(BTRIM(COALESCE(installment.collection_notes, ''))) >= 3
ON CONFLICT (id) DO NOTHING;
