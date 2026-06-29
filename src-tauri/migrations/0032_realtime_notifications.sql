CREATE OR REPLACE FUNCTION kasirku_notify_data_change()
RETURNS trigger AS $$
DECLARE
    changed_row JSONB;
BEGIN
    changed_row := CASE
        WHEN TG_OP = 'DELETE' THEN TO_JSONB(OLD)
        ELSE TO_JSONB(NEW)
    END;

    PERFORM PG_NOTIFY(
        'kasirku_data_changes',
        JSON_BUILD_OBJECT(
            'table', TG_TABLE_NAME,
            'operation', LOWER(TG_OP),
            'id', changed_row ->> 'id',
            'updated_at', COALESCE(
                changed_row ->> 'updated_at',
                changed_row ->> 'created_at',
                NOW()::TEXT
            ),
            'emitted_at', NOW()::TEXT
        )::TEXT
    );

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
    realtime_table_name TEXT;
BEGIN
    FOREACH realtime_table_name IN ARRAY ARRAY[
        'activity_logs',
        'auth_users',
        'contacts',
        'cooperative_areas',
        'cooperative_loan_collection_events',
        'cooperative_loan_installments',
        'cooperative_loan_payments',
        'cooperative_loans',
        'cooperative_member_saving_balances',
        'cooperative_members',
        'cooperative_payment_approval_requests',
        'cooperative_payment_policy',
        'cooperative_posting_accounts',
        'cooperative_saving_transactions',
        'currencies',
        'currency_rates',
        'departments',
        'employee_areas',
        'employee_collection_schedules',
        'employees',
        'finance_transactions',
        'inventory_lot_consumptions',
        'inventory_lots',
        'journal_entries',
        'journal_entry_lines',
        'product_recipe_items',
        'product_recipes',
        'products',
        'production_order_costs',
        'production_order_items',
        'production_orders',
        'projects',
        'purchase_cost_reconciliation_items',
        'purchase_cost_reconciliations',
        'purchase_document_items',
        'purchase_documents',
        'role_permissions',
        'roles',
        'sales_document_items',
        'sales_documents',
        'server_auth_sessions',
        'stock_mutations',
        'stock_opname_items',
        'stock_opnames',
        'taxes',
        'warehouses'
    ] LOOP
        IF TO_REGCLASS(FORMAT('public.%I', realtime_table_name)) IS NOT NULL THEN
            EXECUTE FORMAT(
                'DROP TRIGGER IF EXISTS kasirku_notify_data_change ON public.%I',
                realtime_table_name
            );
            EXECUTE FORMAT(
                'CREATE TRIGGER kasirku_notify_data_change
                 AFTER INSERT OR UPDATE OR DELETE ON public.%I
                 FOR EACH ROW EXECUTE FUNCTION kasirku_notify_data_change()',
                realtime_table_name
            );
        END IF;
    END LOOP;
END;
$$;
