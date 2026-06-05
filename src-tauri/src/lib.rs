// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
mod bluetooth_printer;
mod commands;
mod db;
mod models;
mod repositories;

use tauri::Manager;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_share::init())
        .plugin(bluetooth_printer::init())
        .setup(|app| {
            let state = match tauri::async_runtime::block_on(db::create_pg_pool()) {
                Ok(pool) => {
                    let migration_result =
                        tauri::async_runtime::block_on(sqlx::migrate!("./migrations").run(&pool));
                    if migration_result.is_ok() {
                        db::PgPoolState::available(pool)
                    } else {
                        db::PgPoolState::migration_failed()
                    }
                }
                Err(db::PostgresInitError::DatabaseUrlMissing) => db::PgPoolState::unconfigured(),
                Err(db::PostgresInitError::Unreachable(_)) => db::PgPoolState::unreachable(),
            };
            app.manage(state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            commands::department_commands::postgres_list_departments,
            commands::department_commands::postgres_get_department,
            commands::department_commands::postgres_upsert_department,
            commands::department_commands::postgres_delete_department,
            commands::project_commands::postgres_list_projects,
            commands::project_commands::postgres_get_project,
            commands::project_commands::postgres_upsert_project,
            commands::project_commands::postgres_delete_project,
            commands::tax_commands::postgres_list_taxes,
            commands::tax_commands::postgres_get_tax,
            commands::tax_commands::postgres_upsert_tax,
            commands::tax_commands::postgres_delete_tax,
            commands::contact_commands::postgres_list_contacts,
            commands::contact_commands::postgres_get_contact,
            commands::contact_commands::postgres_upsert_contact,
            commands::contact_commands::postgres_delete_contact,
            commands::warehouse_commands::postgres_list_warehouses,
            commands::warehouse_commands::postgres_get_warehouse,
            commands::warehouse_commands::postgres_upsert_warehouse,
            commands::warehouse_commands::postgres_delete_warehouse,
            commands::currency_commands::postgres_list_currencies,
            commands::currency_commands::postgres_get_currency,
            commands::currency_commands::postgres_upsert_currency,
            commands::currency_commands::postgres_delete_currency,
            commands::currency_commands::postgres_list_currency_rates,
            commands::currency_commands::postgres_get_currency_rate,
            commands::currency_commands::postgres_upsert_currency_rate,
            commands::currency_commands::postgres_delete_currency_rate,
            commands::currency_commands::fetch_bi_kurs_transaksi,
            commands::product_commands::postgres_list_products,
            commands::product_commands::postgres_get_product,
            commands::product_commands::postgres_upsert_product,
            commands::product_commands::postgres_delete_product,
            commands::stock_mutation_commands::postgres_list_stock_mutations,
            commands::stock_mutation_commands::postgres_get_stock_mutation,
            commands::stock_mutation_commands::postgres_upsert_stock_mutation,
            commands::sales_document_commands::postgres_list_sales_document_bundles,
            commands::sales_document_commands::postgres_get_sales_document_bundle,
            commands::sales_document_commands::postgres_upsert_sales_document_bundle,
            commands::purchase_document_commands::postgres_list_purchase_document_bundles,
            commands::purchase_document_commands::postgres_get_purchase_document_bundle,
            commands::purchase_document_commands::postgres_upsert_purchase_document_bundle,
            commands::finance_transaction_commands::postgres_list_finance_transactions,
            commands::finance_transaction_commands::postgres_get_finance_transaction,
            commands::finance_transaction_commands::postgres_upsert_finance_transaction,
            commands::journal_entry_commands::postgres_list_journal_entry_bundles,
            commands::journal_entry_commands::postgres_get_journal_entry_bundle,
            commands::journal_entry_commands::postgres_upsert_journal_entry_bundle,
            commands::auth_commands::postgres_list_auth_users,
            commands::auth_commands::postgres_get_auth_user,
            commands::auth_commands::postgres_upsert_auth_user,
            commands::auth_commands::postgres_list_activity_logs,
            commands::auth_commands::postgres_upsert_activity_log,
            commands::postgres_health::postgres_health_check,
            bluetooth_printer::list_bluetooth_printers,
            bluetooth_printer::test_print_bluetooth,
            bluetooth_printer::print_receipt_bluetooth
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
