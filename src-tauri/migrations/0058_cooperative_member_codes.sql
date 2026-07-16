CREATE TABLE IF NOT EXISTS cooperative_member_codes (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cooperative_member_codes_code
ON cooperative_member_codes (code);

WITH normalized_member_codes AS (
    SELECT
        UPPER(
            CASE
                WHEN UPPER(BTRIM(member_number)) ~ '^KS[PU]-[0-9]+$'
                    THEN LPAD(SPLIT_PART(UPPER(BTRIM(member_number)), '-', 2)::INTEGER::TEXT, 4, '0')
                WHEN BTRIM(member_number) ~ '^[0-9]+$' AND LENGTH(BTRIM(member_number)) < 4
                    THEN LPAD(BTRIM(member_number)::INTEGER::TEXT, 4, '0')
                ELSE BTRIM(member_number)
            END
        ) AS code_id,
        CASE
            WHEN UPPER(BTRIM(member_number)) ~ '^KS[PU]-[0-9]+$'
                THEN LPAD(SPLIT_PART(UPPER(BTRIM(member_number)), '-', 2)::INTEGER::TEXT, 4, '0')
            WHEN BTRIM(member_number) ~ '^[0-9]+$' AND LENGTH(BTRIM(member_number)) < 4
                THEN LPAD(BTRIM(member_number)::INTEGER::TEXT, 4, '0')
            ELSE BTRIM(member_number)
        END AS code,
        created_at,
        updated_at
    FROM cooperative_members
    WHERE BTRIM(COALESCE(member_number, '')) <> ''
),
deduped_member_codes AS (
    SELECT DISTINCT ON (code_id)
        code_id,
        code,
        created_at,
        updated_at
    FROM normalized_member_codes
    ORDER BY code_id, updated_at DESC, created_at ASC
)
INSERT INTO cooperative_member_codes (
    id,
    code,
    created_at,
    updated_at
)
SELECT
    code_id,
    code,
    created_at,
    updated_at
FROM deduped_member_codes
ON CONFLICT (id) DO UPDATE SET
    code = EXCLUDED.code,
    updated_at = GREATEST(cooperative_member_codes.updated_at, EXCLUDED.updated_at);
