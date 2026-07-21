WITH normalized_members AS (
    SELECT
        member.id,
        LPAD(SPLIT_PART(UPPER(BTRIM(member.member_number)), '-', 2)::INTEGER::TEXT, 4, '0') AS code
    FROM cooperative_members member
    WHERE UPPER(BTRIM(member.member_number)) ~ '^KS[PU]-[0-9]+$'
),
members_without_active_conflict AS (
    SELECT normalized_members.*
    FROM normalized_members
    JOIN cooperative_members member ON member.id = normalized_members.id
    WHERE NOT EXISTS (
        SELECT 1
        FROM cooperative_members candidate
        WHERE candidate.id <> member.id
          AND candidate.status = 'ACTIVE'
          AND member.status = 'ACTIVE'
          AND (
              UPPER(BTRIM(candidate.member_number)) = normalized_members.code
              OR (
                  UPPER(BTRIM(candidate.member_number)) ~ '^KS[PU]-[0-9]+$'
                  AND LPAD(SPLIT_PART(UPPER(BTRIM(candidate.member_number)), '-', 2)::INTEGER::TEXT, 4, '0') = normalized_members.code
              )
          )
    )
),
updated_members AS (
    UPDATE cooperative_members member
    SET
        member_number = members_without_active_conflict.code,
        updated_at = NOW()
    FROM members_without_active_conflict
    WHERE member.id = members_without_active_conflict.id
      AND member.member_number <> members_without_active_conflict.code
    RETURNING
        member.id,
        member.member_number AS code,
        member.created_at,
        member.updated_at
)
INSERT INTO cooperative_member_codes (
    id,
    code,
    created_at,
    updated_at
)
SELECT
    UPPER(BTRIM(code)),
    BTRIM(code),
    created_at,
    updated_at
FROM updated_members
WHERE BTRIM(COALESCE(code, '')) <> ''
ON CONFLICT (id) DO UPDATE SET
    code = EXCLUDED.code,
    updated_at = GREATEST(cooperative_member_codes.updated_at, EXCLUDED.updated_at);
