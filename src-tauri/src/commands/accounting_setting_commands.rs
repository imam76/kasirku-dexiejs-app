use crate::{
    db::{PostgresCommandResult, PostgresState},
    models::accounting_setting::{
        AccountingInitialSetupSettingDto, AccountingProfileSettingDto, EnabledModuleDto,
        FinanceAccountMappingDto, GeneralLedgerSettingDto,
    },
    repositories::accounting_setting_repository,
};
use tauri::State;

#[tauri::command]
pub async fn postgres_list_finance_account_mappings(
    state: State<'_, PostgresState>,
) -> PostgresCommandResult<Vec<FinanceAccountMappingDto>> {
    let pool = state.pool()?;
    Ok(accounting_setting_repository::list_finance_account_mappings(&pool).await?)
}

#[tauri::command]
pub async fn postgres_upsert_finance_account_mapping(
    state: State<'_, PostgresState>,
    input: FinanceAccountMappingDto,
) -> PostgresCommandResult<FinanceAccountMappingDto> {
    let pool = state.pool()?;
    Ok(accounting_setting_repository::upsert_finance_account_mapping(&pool, input).await?)
}

#[tauri::command]
pub async fn postgres_get_accounting_profile_setting(
    state: State<'_, PostgresState>,
) -> PostgresCommandResult<Option<AccountingProfileSettingDto>> {
    let pool = state.pool()?;
    Ok(accounting_setting_repository::get_accounting_profile_setting(&pool).await?)
}

#[tauri::command]
pub async fn postgres_upsert_accounting_profile_setting(
    state: State<'_, PostgresState>,
    input: AccountingProfileSettingDto,
) -> PostgresCommandResult<AccountingProfileSettingDto> {
    let pool = state.pool()?;
    Ok(accounting_setting_repository::upsert_accounting_profile_setting(&pool, input).await?)
}

#[tauri::command]
pub async fn postgres_list_enabled_modules(
    state: State<'_, PostgresState>,
) -> PostgresCommandResult<Vec<EnabledModuleDto>> {
    let pool = state.pool()?;
    Ok(accounting_setting_repository::list_enabled_modules(&pool).await?)
}

#[tauri::command]
pub async fn postgres_upsert_enabled_module(
    state: State<'_, PostgresState>,
    input: EnabledModuleDto,
) -> PostgresCommandResult<EnabledModuleDto> {
    let pool = state.pool()?;
    Ok(accounting_setting_repository::upsert_enabled_module(&pool, input).await?)
}

#[tauri::command]
pub async fn postgres_get_general_ledger_setting(
    state: State<'_, PostgresState>,
) -> PostgresCommandResult<Option<GeneralLedgerSettingDto>> {
    let pool = state.pool()?;
    Ok(accounting_setting_repository::get_general_ledger_setting(&pool).await?)
}

#[tauri::command]
pub async fn postgres_upsert_general_ledger_setting(
    state: State<'_, PostgresState>,
    input: GeneralLedgerSettingDto,
) -> PostgresCommandResult<GeneralLedgerSettingDto> {
    let pool = state.pool()?;
    Ok(accounting_setting_repository::upsert_general_ledger_setting(&pool, input).await?)
}

#[tauri::command]
pub async fn postgres_get_accounting_initial_setup_setting(
    state: State<'_, PostgresState>,
) -> PostgresCommandResult<Option<AccountingInitialSetupSettingDto>> {
    let pool = state.pool()?;
    Ok(accounting_setting_repository::get_accounting_initial_setup_setting(&pool).await?)
}

#[tauri::command]
pub async fn postgres_upsert_accounting_initial_setup_setting(
    state: State<'_, PostgresState>,
    input: AccountingInitialSetupSettingDto,
) -> PostgresCommandResult<AccountingInitialSetupSettingDto> {
    let pool = state.pool()?;
    Ok(
        accounting_setting_repository::upsert_accounting_initial_setup_setting(&pool, input)
            .await?,
    )
}
