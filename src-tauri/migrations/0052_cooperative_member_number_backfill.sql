WITH generated_member_number_state AS (
    SELECT COALESCE(MAX((regexp_match(UPPER(BTRIM(member_number)), '^KS[PU]-(\d+)$'))[1]::INTEGER), 0) AS max_sequence
    FROM cooperative_members
    WHERE BTRIM(COALESCE(member_number, '')) <> ''
),
members_without_number AS (
    SELECT
        member.id,
        generated_member_number_state.max_sequence
            + ROW_NUMBER() OVER (ORDER BY member.created_at, member.id) AS generated_sequence
    FROM cooperative_members member
    CROSS JOIN generated_member_number_state
    WHERE BTRIM(COALESCE(member.member_number, '')) = ''
)
UPDATE cooperative_members member
SET
    member_number = 'KSU-' || LPAD(members_without_number.generated_sequence::TEXT, 4, '0'),
    updated_at = NOW()
FROM members_without_number
WHERE member.id = members_without_number.id;
