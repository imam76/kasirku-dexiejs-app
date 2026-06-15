use crate::models::contact::ContactDto;
use sqlx::PgPool;

pub async fn list_contacts(pool: &PgPool) -> Result<Vec<ContactDto>, sqlx::Error> {
    sqlx::query_as::<_, ContactDto>(
        r#"
        SELECT
            id,
            name,
            contact_type,
            phone,
            email,
            address,
            company_name,
            tax_number,
            notes,
            is_active,
            is_member,
            membership_number,
            membership_status,
            membership_joined_at::TEXT AS membership_joined_at,
            membership_points_balance,
            created_at::TEXT AS created_at,
            updated_at::TEXT AS updated_at,
            deleted_at::TEXT AS deleted_at
        FROM contacts
        WHERE deleted_at IS NULL
        ORDER BY name ASC
        "#,
    )
    .fetch_all(pool)
    .await
}

pub async fn get_contact(pool: &PgPool, id: String) -> Result<Option<ContactDto>, sqlx::Error> {
    sqlx::query_as::<_, ContactDto>(
        r#"
        SELECT
            id,
            name,
            contact_type,
            phone,
            email,
            address,
            company_name,
            tax_number,
            notes,
            is_active,
            is_member,
            membership_number,
            membership_status,
            membership_joined_at::TEXT AS membership_joined_at,
            membership_points_balance,
            created_at::TEXT AS created_at,
            updated_at::TEXT AS updated_at,
            deleted_at::TEXT AS deleted_at
        FROM contacts
        WHERE id = $1 AND deleted_at IS NULL
        "#,
    )
    .bind(id)
    .fetch_optional(pool)
    .await
}

async fn get_contact_including_deleted(
    pool: &PgPool,
    id: String,
) -> Result<Option<ContactDto>, sqlx::Error> {
    sqlx::query_as::<_, ContactDto>(
        r#"
        SELECT
            id,
            name,
            contact_type,
            phone,
            email,
            address,
            company_name,
            tax_number,
            notes,
            is_active,
            is_member,
            membership_number,
            membership_status,
            membership_joined_at::TEXT AS membership_joined_at,
            membership_points_balance,
            created_at::TEXT AS created_at,
            updated_at::TEXT AS updated_at,
            deleted_at::TEXT AS deleted_at
        FROM contacts
        WHERE id = $1
        "#,
    )
    .bind(id)
    .fetch_optional(pool)
    .await
}

pub async fn upsert_contact(pool: &PgPool, input: ContactDto) -> Result<ContactDto, sqlx::Error> {
    let contact_id = input.id.clone();
    let upserted_contact = sqlx::query_as::<_, ContactDto>(
        r#"
        INSERT INTO contacts (
            id,
            name,
            contact_type,
            phone,
            email,
            address,
            company_name,
            tax_number,
            notes,
            is_active,
            is_member,
            membership_number,
            membership_status,
            membership_joined_at,
            membership_points_balance,
            created_at,
            updated_at,
            deleted_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::TIMESTAMPTZ, $15, $16::TIMESTAMPTZ, $17::TIMESTAMPTZ, $18::TIMESTAMPTZ)
        ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            contact_type = EXCLUDED.contact_type,
            phone = EXCLUDED.phone,
            email = EXCLUDED.email,
            address = EXCLUDED.address,
            company_name = EXCLUDED.company_name,
            tax_number = EXCLUDED.tax_number,
            notes = EXCLUDED.notes,
            is_active = EXCLUDED.is_active,
            is_member = EXCLUDED.is_member,
            membership_number = EXCLUDED.membership_number,
            membership_status = EXCLUDED.membership_status,
            membership_joined_at = EXCLUDED.membership_joined_at,
            membership_points_balance = EXCLUDED.membership_points_balance,
            updated_at = EXCLUDED.updated_at,
            deleted_at = EXCLUDED.deleted_at
        WHERE EXCLUDED.updated_at >= contacts.updated_at
        RETURNING
            id,
            name,
            contact_type,
            phone,
            email,
            address,
            company_name,
            tax_number,
            notes,
            is_active,
            is_member,
            membership_number,
            membership_status,
            membership_joined_at::TEXT AS membership_joined_at,
            membership_points_balance,
            created_at::TEXT AS created_at,
            updated_at::TEXT AS updated_at,
            deleted_at::TEXT AS deleted_at
        "#,
    )
    .bind(input.id)
    .bind(input.name)
    .bind(input.contact_type)
    .bind(input.phone)
    .bind(input.email)
    .bind(input.address)
    .bind(input.company_name)
    .bind(input.tax_number)
    .bind(input.notes)
    .bind(input.is_active)
    .bind(input.is_member)
    .bind(input.membership_number)
    .bind(input.membership_status)
    .bind(input.membership_joined_at)
    .bind(input.membership_points_balance)
    .bind(input.created_at)
    .bind(input.updated_at)
    .bind(input.deleted_at)
    .fetch_optional(pool)
    .await?;

    if let Some(contact) = upserted_contact {
        return Ok(contact);
    }

    get_contact_including_deleted(pool, contact_id)
        .await?
        .ok_or(sqlx::Error::RowNotFound)
}

pub async fn delete_contact(pool: &PgPool, id: String) -> Result<Option<ContactDto>, sqlx::Error> {
    let deleted_contact = sqlx::query_as::<_, ContactDto>(
        r#"
        UPDATE contacts
        SET
            is_active = FALSE,
            updated_at = NOW(),
            deleted_at = NOW()
        WHERE id = $1 AND deleted_at IS NULL
        RETURNING
            id,
            name,
            contact_type,
            phone,
            email,
            address,
            company_name,
            tax_number,
            notes,
            is_active,
            is_member,
            membership_number,
            membership_status,
            membership_joined_at::TEXT AS membership_joined_at,
            membership_points_balance,
            created_at::TEXT AS created_at,
            updated_at::TEXT AS updated_at,
            deleted_at::TEXT AS deleted_at
        "#,
    )
    .bind(id.clone())
    .fetch_optional(pool)
    .await?;

    if deleted_contact.is_some() {
        return Ok(deleted_contact);
    }

    get_contact_including_deleted(pool, id).await
}
