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
            let pool: db::PgPoolState = tauri::async_runtime::block_on(db::create_pg_pool())?;
            tauri::async_runtime::block_on(sqlx::migrate!("./migrations").run(&pool))?;
            app.manage(pool);
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
            commands::product_commands::postgres_list_products,
            commands::product_commands::postgres_get_product,
            commands::product_commands::postgres_upsert_product,
            commands::product_commands::postgres_delete_product,
            commands::stock_mutation_commands::postgres_list_stock_mutations,
            commands::stock_mutation_commands::postgres_get_stock_mutation,
            commands::stock_mutation_commands::postgres_upsert_stock_mutation,
            commands::postgres_health::postgres_health_check,
            bluetooth_printer::list_bluetooth_printers,
            bluetooth_printer::test_print_bluetooth,
            bluetooth_printer::print_receipt_bluetooth
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
