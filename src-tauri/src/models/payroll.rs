use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct PayrollRunDto {
    pub id: String,
    pub payroll_number: String,
    pub period_start: String,
    pub period_end: String,
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
    pub approved_at: Option<String>,
    pub paid_at: Option<String>,
    pub voided_at: Option<String>,
    pub created_by: Option<String>,
    pub created_by_name: Option<String>,
    pub updated_by: Option<String>,
    pub updated_by_name: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct PayrollRunItemDto {
    pub id: String,
    pub payroll_run_id: String,
    pub employee_id: String,
    pub employee_name: String,
    pub employee_position: Option<String>,
    pub base_salary: f64,
    pub allowance_amount: f64,
    pub bonus_amount: f64,
    pub other_deduction_amount: f64,
    pub cash_advance_deduction_amount: f64,
    pub deduction_amount: f64,
    pub gross_amount: f64,
    pub net_amount: f64,
    pub notes: Option<String>,
    pub created_at: String,
    pub updated_at: String,
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
    pub disbursed_at: String,
    pub payment_method: Option<String>,
    pub payment_channel: Option<String>,
    pub cash_account_id: Option<String>,
    pub cash_account_code: Option<String>,
    pub cash_account_name: Option<String>,
    pub finance_transaction_id: Option<String>,
    pub notes: Option<String>,
    pub voided_at: Option<String>,
    pub void_reason: Option<String>,
    pub created_by: Option<String>,
    pub created_by_name: Option<String>,
    pub updated_by: Option<String>,
    pub updated_by_name: Option<String>,
    pub created_at: String,
    pub updated_at: String,
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
    pub allocated_at: String,
    pub posted_at: Option<String>,
    pub voided_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
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
