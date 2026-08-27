use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct HrPositionDto {
    pub id: String,
    pub code: String,
    pub name: String,
    pub department_id: String,
    pub department_code: Option<String>,
    pub department_name: Option<String>,
    pub level: String,
    pub reports_to_position_id: Option<String>,
    pub reports_to_position_code: Option<String>,
    pub reports_to_position_name: Option<String>,
    pub description: Option<String>,
    pub is_active: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    #[serde(default)]
    #[sqlx(default)]
    pub deleted_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct EmploymentContractDto {
    pub id: String,
    pub contract_number: String,
    pub employee_id: String,
    pub employee_number: Option<String>,
    pub employee_name: String,
    pub contract_type: String,
    pub start_date: String,
    pub end_date: Option<String>,
    pub job_position_id: String,
    pub job_position_code: Option<String>,
    pub job_position_name: String,
    pub department_id: String,
    pub department_code: Option<String>,
    pub department_name: String,
    pub base_salary: f64,
    pub status: String,
    pub notes: Option<String>,
    pub renewed_from_contract_id: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    #[serde(default)]
    #[sqlx(default)]
    pub deleted_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct SalaryComponentDto {
    pub id: String,
    pub code: String,
    pub name: String,
    pub kind: String,
    pub calculation: String,
    pub default_value: f64,
    pub is_taxable: bool,
    pub is_active: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    #[serde(default)]
    #[sqlx(default)]
    pub deleted_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct EmployeeSalaryComponentDto {
    pub id: String,
    pub employee_id: String,
    pub salary_component_id: String,
    pub component_code: String,
    pub component_name: String,
    pub kind: String,
    pub calculation: String,
    pub value: f64,
    pub is_active: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    #[serde(default)]
    #[sqlx(default)]
    pub deleted_at: Option<DateTime<Utc>>,
}
