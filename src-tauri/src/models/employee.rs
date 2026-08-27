use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct EmployeeDto {
    pub id: String,
    #[serde(default)]
    #[sqlx(default)]
    pub employee_number: Option<String>,
    pub name: String,
    #[serde(default)]
    #[sqlx(default)]
    pub preferred_name: Option<String>,
    #[serde(default)]
    #[sqlx(default)]
    pub photo_data_url: Option<String>,
    #[serde(default)]
    #[sqlx(default)]
    pub gender: Option<String>,
    #[serde(default)]
    #[sqlx(default)]
    pub birth_place: Option<String>,
    #[serde(default)]
    #[sqlx(default)]
    pub birth_date: Option<String>,
    #[serde(default)]
    #[sqlx(default)]
    pub marital_status: Option<String>,
    #[serde(default)]
    #[sqlx(default)]
    pub nationality: Option<String>,
    pub phone: Option<String>,
    pub email: Option<String>,
    #[serde(default)]
    #[sqlx(default)]
    pub personal_email: Option<String>,
    pub address: Option<String>,
    #[serde(default)]
    #[sqlx(default)]
    pub identity_address: Option<String>,
    #[serde(default)]
    #[sqlx(default)]
    pub domicile_address: Option<String>,
    #[serde(default)]
    #[sqlx(default)]
    pub emergency_contact_name: Option<String>,
    #[serde(default)]
    #[sqlx(default)]
    pub emergency_contact_relationship: Option<String>,
    #[serde(default)]
    #[sqlx(default)]
    pub emergency_contact_phone: Option<String>,
    #[serde(default)]
    #[sqlx(default)]
    pub nik: Option<String>,
    #[serde(default)]
    #[sqlx(default)]
    pub family_card_number: Option<String>,
    #[serde(default)]
    #[sqlx(default)]
    pub tax_number: Option<String>,
    #[serde(default)]
    #[sqlx(default)]
    pub health_bpjs_number: Option<String>,
    #[serde(default)]
    #[sqlx(default)]
    pub employment_bpjs_number: Option<String>,
    #[serde(default)]
    #[sqlx(default)]
    pub company_unit: Option<String>,
    #[serde(default)]
    #[sqlx(default)]
    pub department_id: Option<String>,
    #[serde(default)]
    #[sqlx(default)]
    pub department_code: Option<String>,
    #[serde(default)]
    #[sqlx(default)]
    pub department_name: Option<String>,
    #[serde(default)]
    #[sqlx(default)]
    pub job_position_id: Option<String>,
    #[serde(default)]
    #[sqlx(default)]
    pub job_position_code: Option<String>,
    #[serde(default)]
    #[sqlx(default)]
    pub job_position_name: Option<String>,
    pub position: Option<String>,
    #[serde(default)]
    #[sqlx(default)]
    pub supervisor_id: Option<String>,
    #[serde(default)]
    #[sqlx(default)]
    pub supervisor_name: Option<String>,
    #[serde(default)]
    #[sqlx(default)]
    pub work_location: Option<String>,
    #[serde(default)]
    #[sqlx(default)]
    pub join_date: Option<String>,
    #[serde(default)]
    #[sqlx(default)]
    pub employment_status: Option<String>,
    #[serde(default)]
    #[sqlx(default)]
    pub active_status: Option<String>,
    #[serde(default)]
    #[sqlx(default)]
    pub work_schedule_type: Option<String>,
    #[serde(default)]
    #[sqlx(default)]
    pub contract_start_date: Option<String>,
    #[serde(default)]
    #[sqlx(default)]
    pub contract_end_date: Option<String>,
    #[serde(default)]
    #[sqlx(default)]
    pub permanent_date: Option<String>,
    #[serde(default)]
    #[sqlx(default)]
    pub exit_date: Option<String>,
    #[serde(default)]
    #[sqlx(default)]
    pub exit_reason: Option<String>,
    #[serde(default)]
    #[sqlx(default)]
    pub salary_payment_method: Option<String>,
    #[serde(default)]
    #[sqlx(default)]
    pub bank_name: Option<String>,
    #[serde(default)]
    #[sqlx(default)]
    pub bank_account_number: Option<String>,
    #[serde(default)]
    #[sqlx(default)]
    pub bank_account_holder: Option<String>,
    #[serde(default)]
    #[sqlx(default)]
    pub base_salary: Option<f64>,
    #[serde(default)]
    #[sqlx(default)]
    pub salary_currency: Option<String>,
    #[serde(default)]
    #[sqlx(default)]
    pub payroll_period: Option<String>,
    #[serde(default)]
    #[sqlx(default)]
    pub is_taxable: Option<bool>,
    #[serde(default)]
    #[sqlx(default)]
    pub ptkp_status: Option<String>,
    #[serde(default)]
    #[sqlx(default)]
    pub is_bpjs_participant: Option<bool>,
    pub user_id: Option<String>,
    pub user_name: Option<String>,
    pub login_role_id: Option<String>,
    pub field_cash_account_id: Option<String>,
    pub field_cash_account_code: Option<String>,
    pub field_cash_account_name: Option<String>,
    pub pin_hash: Option<String>,
    pub pin_salt: Option<String>,
    pub notes: Option<String>,
    pub is_active: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub deleted_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct EmployeeAreaDto {
    pub id: String,
    pub employee_id: String,
    pub area_id: String,
    pub area_name: String,
    pub area_code: Option<String>,
    #[serde(default)]
    #[sqlx(default)]
    pub effective_from: Option<String>,
    #[serde(default)]
    #[sqlx(default)]
    pub effective_until: Option<String>,
    #[serde(default)]
    #[sqlx(default)]
    pub is_primary: Option<bool>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub deleted_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct EmployeeCollectionScheduleDto {
    pub id: String,
    pub employee_id: String,
    pub employee_name: String,
    pub employee_position: Option<String>,
    pub area_id: String,
    pub area_name: String,
    pub area_code: Option<String>,
    pub weekday: i32,
    pub effective_from: Option<String>,
    pub effective_until: Option<String>,
    #[serde(default)]
    #[sqlx(default)]
    pub is_default_for_new_members: Option<bool>,
    pub is_active: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub deleted_at: Option<DateTime<Utc>>,
}
