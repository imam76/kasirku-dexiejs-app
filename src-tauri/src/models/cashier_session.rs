use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct CashierSessionDto {
    pub id: String,
    pub session_number: String,
    pub status: String,
    pub cashier_user_id: Option<String>,
    pub cashier_user_name: Option<String>,
    pub opened_at: String,
    pub opening_cash_amount: f64,
    pub opening_note: Option<String>,
    pub closed_at: Option<String>,
    pub closed_by_user_id: Option<String>,
    pub closed_by_user_name: Option<String>,
    pub closing_cash_amount: Option<f64>,
    pub closing_note: Option<String>,
    pub expected_cash_amount: Option<f64>,
    pub cash_sales_amount: Option<f64>,
    pub non_cash_sales_amount: Option<f64>,
    pub total_sales_amount: Option<f64>,
    pub voided_sales_amount: Option<f64>,
    pub transaction_count: Option<i32>,
    pub voided_transaction_count: Option<i32>,
    pub cash_difference_amount: Option<f64>,
    pub balance_status: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}
