use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct MembershipDto {
    pub id: String,
    pub contact_id: Option<String>,
    pub member_number: String,
    pub name: Option<String>,
    pub phone: String,
    pub email: Option<String>,
    pub status: String,
    pub joined_at: DateTime<Utc>,
    pub points_balance: f64,
    pub is_active: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub deleted_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct MembershipUpsertInputDto {
    #[serde(flatten)]
    pub membership: MembershipDto,
    // Opposite default to products.preserve_stock: before the point ledger existed, the
    // membership snapshot was the only carrier of a balance change. Queue rows written by
    // older builds omit this field and must still apply their balance, or those points are
    // lost. Current builds send true and let point events own the balance.
    #[serde(default)]
    pub preserve_points_balance: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct MembershipPointTransactionDto {
    pub id: String,
    pub membership_id: String,
    pub membership_number: Option<String>,
    pub member_name: String,
    pub transaction_id: Option<String>,
    pub transaction_number: Option<String>,
    #[serde(rename = "type")]
    #[sqlx(rename = "type")]
    pub r#type: String,
    pub points_delta: f64,
    pub amount_value: f64,
    pub balance_after: f64,
    pub reason: String,
    pub created_by: Option<String>,
    pub created_by_name: Option<String>,
    pub created_at: DateTime<Utc>,
    #[serde(default)]
    pub server_created_at: Option<DateTime<Utc>>,
}

#[cfg(test)]
mod tests {
    use super::{MembershipPointTransactionDto, MembershipUpsertInputDto};
    use serde_json::json;

    fn membership_payload() -> serde_json::Value {
        json!({
            "id": "member-1",
            "contact_id": null,
            "member_number": "MBR-20261014-7KQ2M",
            "name": "Member",
            "phone": "08123456789",
            "email": null,
            "status": "ACTIVE",
            "joined_at": "2026-10-14T00:00:00Z",
            "points_balance": 105.0,
            "is_active": true,
            "created_at": "2026-10-14T00:00:00Z",
            "updated_at": "2026-10-14T00:00:00Z",
            "deleted_at": null
        })
    }

    #[test]
    fn legacy_queue_rows_without_the_flag_still_apply_their_balance() {
        let input: MembershipUpsertInputDto = serde_json::from_value(membership_payload()).unwrap();
        assert!(!input.preserve_points_balance);
    }

    #[test]
    fn current_queue_rows_leave_the_balance_to_point_events() {
        let mut payload = membership_payload();
        payload["preserve_points_balance"] = json!(true);
        let input: MembershipUpsertInputDto = serde_json::from_value(payload).unwrap();
        assert!(input.preserve_points_balance);
    }

    #[test]
    fn point_event_payload_reads_without_a_server_timestamp() {
        let input: MembershipPointTransactionDto = serde_json::from_value(json!({
            "id": "point-1",
            "membership_id": "member-1",
            "membership_number": "MBR-20261014-7KQ2M",
            "member_name": "Member",
            "transaction_id": "trx-1",
            "transaction_number": "TRX-1",
            "type": "EARN",
            "points_delta": 5.0,
            "amount_value": 0.0,
            "balance_after": 105.0,
            "reason": "Poin dari transaksi TRX-1",
            "created_by": null,
            "created_by_name": null,
            "created_at": "2026-10-14T00:00:00Z"
        }))
        .unwrap();
        assert_eq!(input.r#type, "EARN");
        assert!(input.server_created_at.is_none());
    }
}
