use crate::{models::department::DepartmentDto, repositories::department_repository};
use sqlx::PgPool;
use tauri::State;

#[tauri::command]
pub async fn postgres_list_departments(
    pool: State<'_, PgPool>,
) -> Result<Vec<DepartmentDto>, String> {
    department_repository::list_departments(&pool)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn postgres_get_department(
    pool: State<'_, PgPool>,
    id: String,
) -> Result<Option<DepartmentDto>, String> {
    department_repository::get_department(&pool, id)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn postgres_upsert_department(
    pool: State<'_, PgPool>,
    input: DepartmentDto,
) -> Result<DepartmentDto, String> {
    department_repository::upsert_department(&pool, input)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn postgres_delete_department(
    pool: State<'_, PgPool>,
    id: String,
) -> Result<Option<DepartmentDto>, String> {
    department_repository::delete_department(&pool, id)
        .await
        .map_err(|error| error.to_string())
}
