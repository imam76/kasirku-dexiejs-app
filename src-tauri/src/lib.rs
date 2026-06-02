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
            commands::postgres_health::postgres_health_check,
            bluetooth_printer::list_bluetooth_printers,
            bluetooth_printer::test_print_bluetooth,
            bluetooth_printer::print_receipt_bluetooth
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
