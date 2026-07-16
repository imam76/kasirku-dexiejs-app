use crate::{
    db::{PostgresCommandResult, PostgresState},
    models::payment_method::PaymentMethodDto,
    repositories::payment_method_repository,
};
use tauri::State;

#[tauri::command]
pub async fn postgres_list_payment_methods(
    state: State<'_, PostgresState>,
) -> PostgresCommandResult<Vec<PaymentMethodDto>> {
    let pool = state.pool()?;
    Ok(payment_method_repository::list_payment_methods(&pool).await?)
}

#[tauri::command]
pub async fn postgres_get_payment_method(
    state: State<'_, PostgresState>,
    id: String,
) -> PostgresCommandResult<Option<PaymentMethodDto>> {
    let pool = state.pool()?;
    Ok(payment_method_repository::get_payment_method(&pool, id).await?)
}

#[tauri::command]
pub async fn postgres_upsert_payment_method(
    state: State<'_, PostgresState>,
    input: PaymentMethodDto,
) -> PostgresCommandResult<PaymentMethodDto> {
    let pool = state.pool()?;
    Ok(payment_method_repository::upsert_payment_method(&pool, input).await?)
}

#[tauri::command]
pub async fn postgres_delete_payment_method(
    state: State<'_, PostgresState>,
    id: String,
) -> PostgresCommandResult<Option<PaymentMethodDto>> {
    let pool = state.pool()?;
    Ok(payment_method_repository::delete_payment_method(&pool, id).await?)
}
