use crate::{
    db::{PostgresCommandResult, PostgresState},
    models::project::ProjectDto,
    repositories::project_repository,
};
use tauri::State;

#[tauri::command]
pub async fn postgres_list_projects(
    state: State<'_, PostgresState>,
) -> PostgresCommandResult<Vec<ProjectDto>> {
    let pool = state.pool()?;
    Ok(project_repository::list_projects(&pool).await?)
}

#[tauri::command]
pub async fn postgres_get_project(
    state: State<'_, PostgresState>,
    id: String,
) -> PostgresCommandResult<Option<ProjectDto>> {
    let pool = state.pool()?;
    Ok(project_repository::get_project(&pool, id).await?)
}

#[tauri::command]
pub async fn postgres_upsert_project(
    state: State<'_, PostgresState>,
    input: ProjectDto,
) -> PostgresCommandResult<ProjectDto> {
    let pool = state.pool()?;
    Ok(project_repository::upsert_project(&pool, input).await?)
}

#[tauri::command]
pub async fn postgres_delete_project(
    state: State<'_, PostgresState>,
    id: String,
) -> PostgresCommandResult<Option<ProjectDto>> {
    let pool = state.pool()?;
    Ok(project_repository::delete_project(&pool, id).await?)
}
