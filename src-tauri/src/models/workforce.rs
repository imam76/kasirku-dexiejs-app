use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct LeaveTypeWriteDto {
    pub id: String,
    pub code: String,
    pub name: String,
    pub is_paid: bool,
    pub requires_balance: bool,
    pub annual_quota_days: f64,
    pub is_active: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct WorkScheduleTemplateWriteDto {
    pub id: String,
    pub code: String,
    pub name: String,
    pub timezone: String,
    pub is_active: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct WorkScheduleDayWriteDto {
    pub id: String,
    pub template_id: String,
    pub weekday: i32,
    pub is_working_day: bool,
    pub start_time: Option<String>,
    pub end_time: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct EmployeeWorkScheduleAssignmentWriteDto {
    pub id: String,
    pub employee_id: String,
    pub template_id: String,
    pub template_name: String,
    pub effective_from: String,
    pub effective_until: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct CompanyCalendarDayWriteDto {
    pub id: String,
    pub date: String,
    pub kind: String,
    pub name: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkScheduleTemplateBundleDto {
    pub session_token: String,
    pub template: WorkScheduleTemplateWriteDto,
    pub days: Vec<WorkScheduleDayWriteDto>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthorizedEmployeeWorkScheduleAssignmentDto {
    pub session_token: String,
    pub assignment: EmployeeWorkScheduleAssignmentWriteDto,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthorizedCompanyCalendarDayDto {
    pub session_token: String,
    pub calendar_day: CompanyCalendarDayWriteDto,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthorizedLeaveTypeDto {
    pub session_token: String,
    pub leave_type: LeaveTypeWriteDto,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthorizedLeaveBalanceLedgerDto {
    pub session_token: String,
    pub ledger: LeaveBalanceLedgerWriteDto,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct LeaveRequestWriteDto {
    pub id: String,
    pub employee_id: String,
    pub employee_name: String,
    pub leave_type_id: String,
    pub leave_type_name: String,
    pub start_date: String,
    pub end_date: String,
    pub day_count: f64,
    pub reason: String,
    pub status: String,
    pub supervisor_id: Option<String>,
    pub supervisor_name: Option<String>,
    pub submitted_at: Option<DateTime<Utc>>,
    pub supervisor_decided_at: Option<DateTime<Utc>>,
    pub hr_decided_at: Option<DateTime<Utc>>,
    pub decided_by: Option<String>,
    pub decided_by_name: Option<String>,
    pub decision_notes: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct LeaveRequestActionWriteDto {
    pub id: String,
    pub leave_request_id: String,
    pub action: String,
    pub actor_user_id: Option<String>,
    pub actor_name: Option<String>,
    pub notes: Option<String>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct LeaveBalanceLedgerWriteDto {
    pub id: String,
    pub employee_id: String,
    pub leave_type_id: String,
    pub year: i32,
    pub movement_kind: String,
    pub available_delta: f64,
    pub reserved_delta: f64,
    pub used_delta: f64,
    pub leave_request_id: Option<String>,
    pub notes: Option<String>,
    pub created_at: DateTime<Utc>,
    pub created_by: Option<String>,
    pub created_by_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct EmployeeAvailabilityWriteDto {
    pub id: String,
    pub employee_id: String,
    pub date: String,
    pub source_type: String,
    pub source_id: String,
    pub reason: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct CollectionCoverageWriteDto {
    pub id: String,
    pub collection_schedule_id: String,
    pub area_id: String,
    pub area_name: String,
    pub original_employee_id: String,
    pub original_employee_name: String,
    pub collection_date: String,
    pub source_leave_request_id: Option<String>,
    pub status: String,
    pub resolution_type: Option<String>,
    pub replacement_employee_id: Option<String>,
    pub replacement_employee_name: Option<String>,
    pub rescheduled_date: Option<String>,
    pub reason: Option<String>,
    pub resolved_at: Option<DateTime<Utc>>,
    pub resolved_by: Option<String>,
    pub resolved_by_name: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FinalizeLeaveRequestDto {
    pub session_token: String,
    pub leave_type: LeaveTypeWriteDto,
    pub request: LeaveRequestWriteDto,
    pub actions: Vec<LeaveRequestActionWriteDto>,
    pub ledger: Vec<LeaveBalanceLedgerWriteDto>,
    pub availability: Vec<EmployeeAvailabilityWriteDto>,
    pub coverage: Vec<CollectionCoverageWriteDto>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LeaveWorkflowBundleDto {
    pub request: LeaveRequestWriteDto,
    pub actions: Vec<LeaveRequestActionWriteDto>,
    pub ledger: Vec<LeaveBalanceLedgerWriteDto>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpsertLeaveWorkflowDto {
    pub session_token: String,
    pub workflow: LeaveWorkflowBundleDto,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CancelApprovedLeaveRequestDto {
    pub session_token: String,
    pub request: LeaveRequestWriteDto,
    pub action: LeaveRequestActionWriteDto,
    pub ledger: Option<LeaveBalanceLedgerWriteDto>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResolveCollectionCoverageDto {
    pub session_token: String,
    pub coverage: CollectionCoverageWriteDto,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkforceStateDto {
    pub work_schedule_templates: Vec<WorkScheduleTemplateWriteDto>,
    pub work_schedule_days: Vec<WorkScheduleDayWriteDto>,
    pub employee_work_schedule_assignments: Vec<EmployeeWorkScheduleAssignmentWriteDto>,
    pub company_calendar_days: Vec<CompanyCalendarDayWriteDto>,
    pub leave_types: Vec<LeaveTypeWriteDto>,
    pub leave_requests: Vec<LeaveRequestWriteDto>,
    pub leave_request_actions: Vec<LeaveRequestActionWriteDto>,
    pub leave_balance_ledger: Vec<LeaveBalanceLedgerWriteDto>,
    pub availability: Vec<EmployeeAvailabilityWriteDto>,
    pub coverage: Vec<CollectionCoverageWriteDto>,
}
