use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

fn default_payroll_period() -> String {
    "MONTHLY".to_string()
}

fn default_salary_currency() -> String {
    "IDR".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct PayrollRunDto {
    pub id: String,
    pub payroll_number: String,
    pub period_start: String,
    pub period_end: String,
    #[serde(default = "default_payroll_period")]
    pub payroll_period: String,
    #[serde(default = "default_salary_currency")]
    pub salary_currency: String,
    pub status: String,
    pub employee_count: i32,
    pub gross_amount: f64,
    pub allowance_amount: f64,
    pub bonus_amount: f64,
    pub other_deduction_amount: f64,
    pub cash_advance_deduction_amount: f64,
    pub deduction_amount: f64,
    pub net_amount: f64,
    pub payment_method: Option<String>,
    pub payment_channel: Option<String>,
    pub cash_account_id: Option<String>,
    pub cash_account_code: Option<String>,
    pub cash_account_name: Option<String>,
    pub finance_transaction_id: Option<String>,
    pub notes: Option<String>,
    pub approved_at: Option<DateTime<Utc>>,
    pub paid_at: Option<DateTime<Utc>>,
    pub voided_at: Option<DateTime<Utc>>,
    pub created_by: Option<String>,
    pub created_by_name: Option<String>,
    pub updated_by: Option<String>,
    pub updated_by_name: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct PayrollRunItemDto {
    pub id: String,
    pub payroll_run_id: String,
    pub employee_id: String,
    pub employee_name: String,
    pub employee_number: Option<String>,
    pub employee_position: Option<String>,
    pub employee_department: Option<String>,
    #[serde(default = "default_payroll_period")]
    pub payroll_period: String,
    #[serde(default = "default_salary_currency")]
    pub salary_currency: String,
    pub salary_payment_method: Option<String>,
    pub base_salary: f64,
    pub allowance_amount: f64,
    pub bonus_amount: f64,
    pub other_deduction_amount: f64,
    pub cash_advance_deduction_amount: f64,
    pub deduction_amount: f64,
    pub gross_amount: f64,
    pub net_amount: f64,
    pub notes: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct EmployeeCashAdvanceDto {
    pub id: String,
    pub advance_number: String,
    pub employee_id: String,
    pub employee_name: String,
    pub employee_position: Option<String>,
    pub amount: f64,
    pub outstanding_amount: f64,
    pub status: String,
    pub disbursed_at: DateTime<Utc>,
    pub payment_method: Option<String>,
    pub payment_channel: Option<String>,
    pub cash_account_id: Option<String>,
    pub cash_account_code: Option<String>,
    pub cash_account_name: Option<String>,
    pub finance_transaction_id: Option<String>,
    pub notes: Option<String>,
    pub voided_at: Option<DateTime<Utc>>,
    pub void_reason: Option<String>,
    pub created_by: Option<String>,
    pub created_by_name: Option<String>,
    pub updated_by: Option<String>,
    pub updated_by_name: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct EmployeeCashAdvanceRepaymentDto {
    pub id: String,
    pub cash_advance_id: String,
    pub cash_advance_number: String,
    pub payroll_run_id: String,
    pub payroll_run_item_id: String,
    pub payroll_number: Option<String>,
    pub employee_id: String,
    pub employee_name: String,
    pub amount: f64,
    pub status: String,
    pub allocated_at: DateTime<Utc>,
    pub posted_at: Option<DateTime<Utc>>,
    pub voided_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PayrollRunBundleDto {
    pub run: PayrollRunDto,
    pub items: Vec<PayrollRunItemDto>,
    pub cash_advance_repayments: Vec<EmployeeCashAdvanceRepaymentDto>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmployeeCashAdvanceBundleDto {
    pub cash_advance: EmployeeCashAdvanceDto,
    pub repayments: Vec<EmployeeCashAdvanceRepaymentDto>,
}
