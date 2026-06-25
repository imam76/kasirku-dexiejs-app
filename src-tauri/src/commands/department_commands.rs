use crate::{
    db::{PostgresCommandResult, PostgresState},
    models::department::DepartmentDto,
    repositories::department_repository,
};
use tauri::State;

#[tauri::command]
pub async fn postgres_list_departments(
    state: State<'_, PostgresState>,
) -> PostgresCommandResult<Vec<DepartmentDto>> {
    let pool = state.pool()?;
    Ok(department_repository::list_departments(&pool).await?)
}

#[tauri::command]
pub async fn postgres_get_department(
    state: State<'_, PostgresState>,
    id: String,
) -> PostgresCommandResult<Option<DepartmentDto>> {
    let pool = state.pool()?;
    Ok(department_repository::get_department(&pool, id).await?)
}

#[tauri::command]
pub async fn postgres_upsert_department(
    state: State<'_, PostgresState>,
    input: DepartmentDto,
) -> PostgresCommandResult<DepartmentDto> {
    let pool = state.pool()?;
    Ok(department_repository::upsert_department(&pool, input).await?)
}

#[tauri::command]
pub async fn postgres_delete_department(
    state: State<'_, PostgresState>,
    id: String,
) -> PostgresCommandResult<Option<DepartmentDto>> {
    let pool = state.pool()?;
    Ok(department_repository::delete_department(&pool, id).await?)
}
