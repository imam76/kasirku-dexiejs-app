// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
mod bluetooth_printer;
mod commands;
mod db;
mod models;
mod postgres_realtime;
mod repositories;
mod usb_serial_printer;

use tauri::Manager;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_share::init())
        .plugin(bluetooth_printer::init());

    #[cfg(desktop)]
    let builder = builder
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build());

    builder
        .setup(|app| {
            let state = tauri::async_runtime::block_on(db::create_postgres_state());
            let realtime_state = postgres_realtime::PostgresRealtimeState::default();
            realtime_state.restart(app.handle().clone(), state.health().available);
            app.manage(state);
            app.manage(realtime_state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            commands::department_commands::postgres_list_departments,
            commands::department_commands::postgres_get_department,
            commands::department_commands::postgres_upsert_department,
            commands::department_commands::postgres_delete_department,
            commands::chart_of_account_commands::postgres_list_chart_of_accounts,
            commands::chart_of_account_commands::postgres_get_chart_of_account,
            commands::chart_of_account_commands::postgres_upsert_chart_of_account,
            commands::chart_of_account_commands::postgres_delete_chart_of_account,
            commands::accounting_setting_commands::postgres_list_finance_account_mappings,
            commands::accounting_setting_commands::postgres_upsert_finance_account_mapping,
            commands::accounting_setting_commands::postgres_get_accounting_profile_setting,
            commands::accounting_setting_commands::postgres_upsert_accounting_profile_setting,
            commands::accounting_setting_commands::postgres_list_enabled_modules,
            commands::accounting_setting_commands::postgres_upsert_enabled_module,
            commands::accounting_setting_commands::postgres_get_general_ledger_setting,
            commands::accounting_setting_commands::postgres_upsert_general_ledger_setting,
            commands::accounting_setting_commands::postgres_get_accounting_initial_setup_setting,
            commands::accounting_setting_commands::postgres_upsert_accounting_initial_setup_setting,
            commands::employee_commands::postgres_list_employees,
            commands::employee_commands::postgres_get_employee,
            commands::employee_commands::postgres_upsert_employee,
            commands::employee_commands::postgres_list_employee_areas,
            commands::employee_commands::postgres_upsert_employee_area,
            commands::employee_commands::postgres_list_employee_collection_schedules,
            commands::employee_commands::postgres_upsert_employee_collection_schedule,
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
            commands::payment_method_commands::postgres_list_payment_methods,
            commands::payment_method_commands::postgres_get_payment_method,
            commands::payment_method_commands::postgres_upsert_payment_method,
            commands::payment_method_commands::postgres_delete_payment_method,
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
            commands::stock_opname_commands::postgres_list_stock_opname_bundles,
            commands::stock_opname_commands::postgres_get_stock_opname_bundle,
            commands::stock_opname_commands::postgres_upsert_stock_opname_bundle,
            commands::production_order_commands::postgres_list_production_order_bundles,
            commands::production_order_commands::postgres_get_production_order_bundle,
            commands::production_order_commands::postgres_upsert_production_order_bundle,
            commands::purchase_document_commands::postgres_list_purchase_document_bundles,
            commands::purchase_document_commands::postgres_get_purchase_document_bundle,
            commands::purchase_document_commands::postgres_upsert_purchase_document_bundle,
            commands::payroll_commands::postgres_list_payroll_run_bundles,
            commands::payroll_commands::postgres_get_payroll_run_bundle,
            commands::payroll_commands::postgres_upsert_payroll_run_bundle,
            commands::payroll_commands::postgres_list_employee_cash_advance_bundles,
            commands::payroll_commands::postgres_get_employee_cash_advance_bundle,
            commands::payroll_commands::postgres_upsert_employee_cash_advance_bundle,
            commands::finance_transaction_commands::postgres_list_finance_transactions,
            commands::finance_transaction_commands::postgres_get_finance_transaction,
            commands::finance_transaction_commands::postgres_upsert_finance_transaction,
            commands::cash_bank_reconciliation_commands::postgres_list_cash_bank_reconciliations,
            commands::cash_bank_reconciliation_commands::postgres_get_cash_bank_reconciliation,
            commands::cash_bank_reconciliation_commands::postgres_upsert_cash_bank_reconciliation,
            commands::accounting_period_commands::postgres_list_accounting_periods,
            commands::accounting_period_commands::postgres_get_accounting_period,
            commands::accounting_period_commands::postgres_upsert_accounting_period,
            commands::accounting_fiscal_year_commands::postgres_list_accounting_fiscal_years,
            commands::accounting_fiscal_year_commands::postgres_get_accounting_fiscal_year,
            commands::accounting_fiscal_year_commands::postgres_upsert_accounting_fiscal_year,
            commands::closing_run_commands::postgres_list_closing_runs,
            commands::closing_run_commands::postgres_get_closing_run,
            commands::closing_run_commands::postgres_upsert_closing_run,
            commands::fiscal_year_closing_run_commands::postgres_list_fiscal_year_closing_runs,
            commands::fiscal_year_closing_run_commands::postgres_get_fiscal_year_closing_run,
            commands::fiscal_year_closing_run_commands::postgres_upsert_fiscal_year_closing_run,
            commands::cashier_session_commands::postgres_list_cashier_sessions,
            commands::cashier_session_commands::postgres_get_cashier_session,
            commands::cashier_session_commands::postgres_upsert_cashier_session,
            commands::journal_entry_commands::postgres_list_journal_entry_bundles,
            commands::journal_entry_commands::postgres_get_journal_entry_bundle,
            commands::journal_entry_commands::postgres_upsert_journal_entry_bundle,
            commands::opening_balance_commands::postgres_list_opening_balance_bundles,
            commands::opening_balance_commands::postgres_get_opening_balance_bundle,
            commands::opening_balance_commands::postgres_upsert_opening_balance_bundle,
            commands::cooperative_commands::postgres_list_cooperative_areas,
            commands::cooperative_commands::postgres_get_cooperative_area,
            commands::cooperative_commands::postgres_upsert_cooperative_area,
            commands::cooperative_commands::postgres_list_cooperative_members,
            commands::cooperative_commands::postgres_get_cooperative_member,
            commands::cooperative_commands::postgres_upsert_cooperative_member,
            commands::cooperative_commands::postgres_list_cooperative_member_codes,
            commands::cooperative_commands::postgres_upsert_cooperative_member_code,
            commands::cooperative_commands::postgres_list_cooperative_saving_transactions,
            commands::cooperative_commands::postgres_get_cooperative_saving_transaction,
            commands::cooperative_commands::postgres_upsert_cooperative_saving_transaction,
            commands::cooperative_commands::postgres_list_cooperative_member_saving_balances,
            commands::cooperative_commands::postgres_get_cooperative_member_saving_balance,
            commands::cooperative_commands::postgres_upsert_cooperative_member_saving_balance,
            commands::cooperative_commands::postgres_list_cooperative_loans,
            commands::cooperative_commands::postgres_get_cooperative_loan,
            commands::cooperative_commands::postgres_upsert_cooperative_loan,
            commands::cooperative_commands::postgres_delete_cooperative_loan_application,
            commands::cooperative_commands::postgres_delete_cooperative_loan_migration,
            commands::cooperative_commands::postgres_list_cooperative_loan_installments,
            commands::cooperative_commands::postgres_get_cooperative_loan_installment,
            commands::cooperative_commands::postgres_upsert_cooperative_loan_installment,
            commands::cooperative_commands::postgres_list_cooperative_loan_payments,
            commands::cooperative_commands::postgres_get_cooperative_loan_payment,
            commands::cooperative_commands::postgres_upsert_cooperative_loan_payment,
            commands::cooperative_commands::postgres_register_cooperative_posting_accounts,
            commands::cooperative_commands::postgres_post_cooperative_loan_payment,
            commands::cooperative_commands::postgres_post_cooperative_loan_payment_batch,
            commands::cooperative_commands::postgres_list_cooperative_payment_approval_requests,
            commands::cooperative_commands::postgres_request_cooperative_payment_reversal,
            commands::cooperative_commands::postgres_approve_cooperative_payment_request,
            commands::cooperative_commands::postgres_reject_cooperative_payment_request,
            commands::cooperative_commands::postgres_list_cooperative_payment_installment_reconciliation,
            commands::cooperative_commands::postgres_list_cooperative_loan_collection_events,
            commands::cooperative_commands::postgres_record_cooperative_loan_collection_event,
            commands::auth_commands::postgres_list_auth_users,
            commands::auth_commands::postgres_get_auth_user,
            commands::auth_commands::postgres_upsert_auth_user,
            commands::auth_commands::postgres_list_roles,
            commands::auth_commands::postgres_get_role,
            commands::auth_commands::postgres_upsert_role,
            commands::auth_commands::postgres_list_role_permissions,
            commands::auth_commands::postgres_get_role_permission,
            commands::auth_commands::postgres_upsert_role_permission,
            commands::auth_commands::postgres_list_activity_logs,
            commands::auth_commands::postgres_upsert_activity_log,
            commands::auth_commands::postgres_authenticate_server_session,
            commands::auth_commands::postgres_revoke_server_session,
            commands::app_setup_config_commands::postgres_get_app_setup_config,
            commands::app_setup_config_commands::postgres_upsert_app_setup_config,
            commands::company_profile_setting_commands::postgres_get_company_profile_setting,
            commands::company_profile_setting_commands::postgres_upsert_company_profile_setting,
            commands::postgres_health::postgres_health_check,
            commands::postgres_health::set_postgres_database_url,
            bluetooth_printer::list_bluetooth_printers,
            bluetooth_printer::test_print_bluetooth,
            bluetooth_printer::print_receipt_bluetooth,
            usb_serial_printer::list_usb_serial_printers,
            usb_serial_printer::write_usb_serial_printer
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
