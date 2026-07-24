use crate::models::{
    finance_transaction::FinanceTransactionDto, journal_entry::JournalEntryBundleDto,
};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct CooperativeAreaDto {
    pub id: String,
    pub name: String,
    pub code: Option<String>,
    pub description: Option<String>,
    pub is_active: bool,
    pub created_at: String,
    pub updated_at: String,
    pub deleted_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct CooperativeMemberDto {
    pub id: String,
    pub member_number: String,
    pub name: String,
    pub identity_number: Option<String>,
    pub phone: Option<String>,
    pub address: Option<String>,
    pub area_id: Option<String>,
    pub area_name: Option<String>,
    pub area_code: Option<String>,
    pub officer_id: Option<String>,
    pub officer_name: Option<String>,
    pub officer_position: Option<String>,
    pub join_date: String,
    pub status: String,
    pub notes: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub created_by: Option<String>,
    pub created_by_name: Option<String>,
    pub updated_by: Option<String>,
    pub updated_by_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct CooperativeMemberCodeDto {
    pub id: String,
    pub code: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct CooperativeSavingTransactionDto {
    pub id: String,
    pub member_id: String,
    pub member_number: String,
    pub member_name: String,
    pub saving_type: String,
    pub transaction_type: String,
    pub withdrawal_source: Option<String>,
    pub interest_rate_per_month: Option<f64>,
    pub opening_interest_amount: Option<f64>,
    pub opening_interest_applied_amount: Option<f64>,
    pub amount: f64,
    pub transaction_date: String,
    pub status: String,
    pub cash_account_id: Option<String>,
    pub cash_account_code: Option<String>,
    pub cash_account_name: Option<String>,
    pub payment_method: Option<String>,
    pub payment_channel: Option<String>,
    pub finance_transaction_id: Option<String>,
    pub journal_entry_id: Option<String>,
    pub reversal_of_transaction_id: Option<String>,
    pub reversal_transaction_id: Option<String>,
    pub reversal_finance_transaction_id: Option<String>,
    pub reversal_journal_entry_id: Option<String>,
    pub reversed_at: Option<String>,
    pub reversal_reason: Option<String>,
    pub notes: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub created_by: Option<String>,
    pub created_by_name: Option<String>,
    pub updated_by: Option<String>,
    pub updated_by_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct CooperativeMemberSavingBalanceDto {
    pub id: String,
    pub member_id: String,
    pub member_number: String,
    pub member_name: String,
    pub saving_type: String,
    pub balance: f64,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct CooperativeLoanDto {
    pub id: String,
    pub loan_number: String,
    pub member_id: String,
    pub member_number: String,
    pub member_name: String,
    pub principal_amount: f64,
    pub interest_rate_per_month: f64,
    pub tenor_months: i32,
    pub interest_calculation_type: String,
    pub billing_frequency: String,
    pub installment_count: i32,
    pub loan_service_rate: f64,
    pub loan_service_amount: f64,
    pub admin_fee_rate: f64,
    pub admin_fee_amount: f64,
    pub mandatory_saving_rate: f64,
    pub mandatory_saving_amount: f64,
    pub deduction_method: String,
    pub net_disbursement_amount: f64,
    pub total_interest_amount: f64,
    pub total_payable_amount: f64,
    pub outstanding_principal_amount: f64,
    pub outstanding_interest_amount: f64,
    pub outstanding_penalty_amount: f64,
    pub status: String,
    pub application_date: String,
    pub approved_at: Option<String>,
    pub approved_by: Option<String>,
    pub approved_by_name: Option<String>,
    pub approval_notes: Option<String>,
    pub rejected_at: Option<String>,
    pub rejected_by: Option<String>,
    pub rejected_by_name: Option<String>,
    pub rejection_reason: Option<String>,
    pub disbursed_at: Option<String>,
    pub scheduled_disbursement_date: Option<String>,
    pub officer_id: Option<String>,
    pub officer_name: Option<String>,
    pub officer_position: Option<String>,
    pub area_id: Option<String>,
    pub area_name: Option<String>,
    pub area_code: Option<String>,
    pub collection_schedule_id: Option<String>,
    pub collection_weekday: Option<i32>,
    pub cash_account_id: Option<String>,
    pub cash_account_code: Option<String>,
    pub cash_account_name: Option<String>,
    pub payment_method: Option<String>,
    pub payment_channel: Option<String>,
    pub finance_transaction_id: Option<String>,
    pub journal_entry_id: Option<String>,
    pub reversal_finance_transaction_id: Option<String>,
    pub reversal_journal_entry_id: Option<String>,
    pub reversed_at: Option<String>,
    pub reversal_reason: Option<String>,
    pub disbursement_notes: Option<String>,
    pub notes: Option<String>,
    pub is_migration: Option<bool>,
    pub created_at: String,
    pub updated_at: String,
    pub created_by: Option<String>,
    pub created_by_name: Option<String>,
    pub updated_by: Option<String>,
    pub updated_by_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct CooperativeLoanInstallmentDto {
    pub id: String,
    pub loan_id: String,
    pub loan_number: String,
    pub member_id: String,
    pub member_number: String,
    pub member_name: String,
    pub installment_number: i32,
    pub due_date: String,
    pub principal_amount: f64,
    pub interest_amount: f64,
    pub penalty_amount: f64,
    pub paid_principal_amount: f64,
    pub paid_interest_amount: f64,
    pub paid_penalty_amount: f64,
    pub status: String,
    pub paid_at: Option<String>,
    pub collection_status: Option<String>,
    pub follow_up_date: Option<String>,
    pub collection_notes: Option<String>,
    pub last_contacted_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct CooperativeLoanPaymentDto {
    pub id: String,
    pub payment_number: String,
    pub payment_type: Option<String>,
    pub payment_group_id: Option<String>,
    pub payment_group_number: Option<String>,
    pub payment_group_sequence: Option<i32>,
    pub payment_group_total: Option<i32>,
    pub loan_id: String,
    pub loan_number: String,
    pub installment_id: Option<String>,
    pub member_id: String,
    pub member_number: String,
    pub member_name: String,
    pub amount: f64,
    pub principal_amount: f64,
    pub interest_amount: f64,
    pub penalty_amount: f64,
    pub payment_date: String,
    pub status: String,
    pub cash_account_id: Option<String>,
    pub cash_account_code: Option<String>,
    pub cash_account_name: Option<String>,
    pub payment_method: Option<String>,
    pub payment_channel: Option<String>,
    pub collector_id: Option<String>,
    pub collector_name: Option<String>,
    pub collector_position: Option<String>,
    pub received_by: Option<String>,
    pub received_by_name: Option<String>,
    pub posted_at: Option<String>,
    pub finance_transaction_id: Option<String>,
    pub journal_entry_id: Option<String>,
    pub reversal_of_payment_id: Option<String>,
    pub reversal_payment_id: Option<String>,
    pub reversal_finance_transaction_id: Option<String>,
    pub reversal_journal_entry_id: Option<String>,
    pub reversed_at: Option<String>,
    pub reversal_reason: Option<String>,
    pub notes: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub created_by: Option<String>,
    pub created_by_name: Option<String>,
    pub updated_by: Option<String>,
    pub updated_by_name: Option<String>,
    pub idempotency_key: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct CooperativePostingAccountDto {
    pub id: String,
    pub account_key: Option<String>,
    pub code: String,
    pub name: String,
    pub account_type: String,
    pub is_postable: bool,
    pub is_active: bool,
    pub is_cash_or_bank: bool,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RegisterCooperativePostingAccountsInput {
    pub session_token: String,
    pub accounts: Vec<CooperativePostingAccountDto>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PostCooperativeLoanPaymentInput {
    pub session_token: String,
    pub idempotency_key: String,
    pub installment_id: String,
    pub amount: f64,
    pub payment_date: String,
    pub payment_method: String,
    pub cash_account_id: String,
    pub payment_channel: Option<String>,
    pub collector_id: Option<String>,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PostCooperativeLoanPaymentResult {
    pub payment: CooperativeLoanPaymentDto,
    pub installment: CooperativeLoanInstallmentDto,
    pub loan: CooperativeLoanDto,
    pub finance_transaction: FinanceTransactionDto,
    pub journal_entry: JournalEntryBundleDto,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PostCooperativeLoanPaymentBatchResult {
    pub payments: Vec<CooperativeLoanPaymentDto>,
    pub installments: Vec<CooperativeLoanInstallmentDto>,
    pub loan: CooperativeLoanDto,
    pub finance_transactions: Vec<FinanceTransactionDto>,
    pub journal_entries: Vec<JournalEntryBundleDto>,
    pub payment_group_id: Option<String>,
    pub payment_group_number: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct CooperativePaymentApprovalRequestDto {
    pub id: String,
    pub action_type: String,
    pub status: String,
    pub payment_id: Option<String>,
    pub installment_id: Option<String>,
    pub idempotency_key: Option<String>,
    pub amount: Option<f64>,
    pub payment_date: Option<String>,
    pub payment_method: Option<String>,
    pub cash_account_id: Option<String>,
    pub payment_channel: Option<String>,
    pub collector_id: Option<String>,
    pub maker_reason: String,
    pub maker_user_id: String,
    pub maker_user_name: String,
    pub requested_at: String,
    pub checker_user_id: Option<String>,
    pub checker_user_name: Option<String>,
    pub checker_notes: Option<String>,
    pub decided_at: Option<String>,
    pub result_payment_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "status", rename_all = "SCREAMING_SNAKE_CASE")]
pub enum PostCooperativeLoanPaymentOutcome {
    Posted {
        result: PostCooperativeLoanPaymentResult,
    },
    PendingApproval {
        approval_request: CooperativePaymentApprovalRequestDto,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "status", rename_all = "SCREAMING_SNAKE_CASE")]
pub enum PostCooperativeLoanPaymentBatchOutcome {
    Posted {
        result: PostCooperativeLoanPaymentBatchResult,
    },
    PendingApproval {
        approval_request: CooperativePaymentApprovalRequestDto,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RequestCooperativeLoanPaymentReversalInput {
    pub session_token: String,
    pub payment_id: String,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DecideCooperativePaymentApprovalInput {
    pub session_token: String,
    pub request_id: String,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct CooperativePaymentInstallmentReconciliationDto {
    pub installment_id: String,
    pub loan_id: String,
    pub loan_number: String,
    pub installment_number: i32,
    pub expected_principal_amount: f64,
    pub actual_principal_amount: f64,
    pub expected_interest_amount: f64,
    pub actual_interest_amount: f64,
    pub expected_penalty_amount: f64,
    pub actual_penalty_amount: f64,
    pub difference_amount: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct CooperativeLoanCollectionEventDto {
    pub id: String,
    pub installment_id: String,
    pub loan_id: String,
    pub loan_number: String,
    pub member_id: String,
    pub member_number: String,
    pub member_name: String,
    pub collection_status: String,
    pub follow_up_date: Option<String>,
    pub collection_notes: String,
    pub contacted_at: String,
    pub actor_user_id: Option<String>,
    pub actor_user_name: Option<String>,
    pub actor_employee_id: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecordCooperativeLoanCollectionEventInput {
    pub session_token: String,
    pub event_id: String,
    pub installment_id: String,
    pub collection_status: String,
    pub follow_up_date: Option<String>,
    pub collection_notes: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecordCooperativeLoanCollectionEventResult {
    pub event: CooperativeLoanCollectionEventDto,
    pub installment: CooperativeLoanInstallmentDto,
}
