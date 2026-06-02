use crate::{models::project::ProjectDto, repositories::project_repository};
use sqlx::PgPool;
use tauri::State;

#[tauri::command]
pub async fn postgres_list_projects(pool: State<'_, PgPool>) -> Result<Vec<ProjectDto>, String> {
    project_repository::list_projects(&pool)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn postgres_get_project(
    pool: State<'_, PgPool>,
    id: String,
) -> Result<Option<ProjectDto>, String> {
    project_repository::get_project(&pool, id)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn postgres_upsert_project(
    pool: State<'_, PgPool>,
    input: ProjectDto,
) -> Result<ProjectDto, String> {
    project_repository::upsert_project(&pool, input)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn postgres_delete_project(
    pool: State<'_, PgPool>,
    id: String,
) -> Result<Option<ProjectDto>, String> {
    project_repository::delete_project(&pool, id)
        .await
        .map_err(|error| error.to_string())
}
