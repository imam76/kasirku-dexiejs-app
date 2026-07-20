import type * as DatabaseTypes from '@/types';
import type { KasirkuDB } from '../../KasirkuDB';
import { getAccountNormalBalance } from '@/utils/chartOfAccounts/getAccountNormalBalance';

const roundCurrency = (value: number) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

export function registerMigrationV100(db: KasirkuDB) {
  db.version(100).stores({
    salesInvoicePayments: 'id, payment_number, sales_document_id, contact_id, paid_at, status, overpayment_status, finance_transaction_id, created_at',
    salesOverpaymentSettlements: 'id, settlement_number, source_payment_id, contact_id, method, status, settlement_date, finance_transaction_id, journal_entry_id, created_at',
    salesOverpaymentSettlementAllocations: 'id, settlement_id, target_sales_document_id, target_payment_id',
  }).upgrade(async (tx) => {
    const now = new Date().toISOString();
    const paymentTable = tx.table<DatabaseTypes.SalesInvoicePayment, string>('salesInvoicePayments');
    const payments = await paymentTable.toArray();

    if (payments.length > 0) {
      await paymentTable.bulkPut(payments.map((payment) => {
        const amount = roundCurrency(payment.amount);
        const foreignAmount = payment.foreign_amount === undefined
          ? undefined
          : roundCurrency(payment.foreign_amount);
        const overpaymentAmount = roundCurrency(payment.overpayment_amount ?? 0);
        const usedAmount = roundCurrency(payment.overpayment_used_amount ?? 0);
        const remainingAmount = roundCurrency(Math.max(0, overpaymentAmount - usedAmount));

        return {
          ...payment,
          allocated_amount: payment.allocated_amount === undefined
            ? amount
            : roundCurrency(payment.allocated_amount),
          foreign_allocated_amount: payment.foreign_allocated_amount === undefined
            ? foreignAmount
            : roundCurrency(payment.foreign_allocated_amount),
          overpayment_amount: overpaymentAmount,
          foreign_overpayment_amount: payment.foreign_overpayment_amount === undefined
            ? 0
            : roundCurrency(payment.foreign_overpayment_amount),
          overpayment_used_amount: usedAmount,
          foreign_overpayment_used_amount: payment.foreign_overpayment_used_amount === undefined
            ? 0
            : roundCurrency(payment.foreign_overpayment_used_amount),
          overpayment_remaining_amount: remainingAmount,
          foreign_overpayment_remaining_amount: payment.foreign_overpayment_remaining_amount === undefined
            ? 0
            : roundCurrency(payment.foreign_overpayment_remaining_amount),
          overpayment_status: payment.status === 'VOIDED'
            ? 'CANCELLED' as const
            : overpaymentAmount <= 0
              ? undefined
              : remainingAmount <= 0
                ? 'SETTLED' as const
                : usedAmount > 0
                  ? 'PARTIALLY_USED' as const
                  : 'OPEN' as const,
        };
      }));
    }

    const chartOfAccounts = tx.table<DatabaseTypes.ChartOfAccount, string>('chartOfAccounts');
    const existingCustomerCreditAccount = await chartOfAccounts.get('customer-credit');
    if (!existingCustomerCreditAccount) {
      await chartOfAccounts.put({
        id: 'customer-credit',
        code: '2220',
        name: 'Kredit Pelanggan',
        type: 'LIABILITY',
        normal_balance: getAccountNormalBalance('LIABILITY'),
        parent_id: 'liability-current',
        parent_code: '2200',
        parent_name: 'Kewajiban Lancar',
        is_postable: true,
        is_system: true,
        is_active: true,
        description: 'Akun kewajiban untuk saldo lebih bayar atau customer credit pelanggan.',
        created_at: now,
        updated_at: now,
        sync_status: 'pending',
        sync_error: undefined,
      });
    }
  });
}
