import { getCurrentSessionUser, requireUserPermission } from '@/auth/authService';
import { db } from '@/lib/db';
import type { DashboardDateRange } from '@/utils/dashboardDateRanges';
import { buildSlowMovingRows, getSlowMovingBounds } from '@/utils/inventory/slowMovingReport';
import { DEFAULT_CONVERSIONS } from '@/constants/units';

export const getSlowMovingReport = async (range: DashboardDateRange) => {
  await requireUserPermission(await getCurrentSessionUser({ touchSession: false, cleanupInvalidSession: false }), 'REPORT_SLOW_MOVING_VIEW');
  const { start, end, days } = getSlowMovingBounds(range);
  return db.transaction('r', [db.products, db.transactions, db.transactionItems, db.salesDocuments,
    db.salesDocumentItems, db.salesReturns, db.salesReturnItems, db.unitConversions], async () => {
    const [products, transactions, invoices, returns, conversions] = await Promise.all([
      db.products.toArray(),
      db.transactions.where('created_at').between(start, end, true, true).toArray(),
      db.salesDocuments.where('[type+document_date+id]').between(
        ['SALES_INVOICE', range.startDate, ''], ['SALES_INVOICE', range.endDate, '\uffff'], true, true,
      ).toArray(),
      db.salesReturns.where('document_date').between(range.startDate, range.endDate, true, true)
        .filter((item) => item.status === 'ISSUED' && item.source_type !== 'SALES_DELIVERY').toArray(),
      db.unitConversions.toArray(),
    ]);
    const transactionIds = transactions.filter((item) => item.status !== 'VOIDED' && item.business_type !== 'EXPENSE').map((item) => item.id);
    const invoiceIds = invoices.filter((item) => item.status === 'ISSUED').map((item) => item.id);
    const [transactionItems, invoiceItems, returnItems, returnTransactions, returnInvoices] = await Promise.all([
      transactionIds.length ? db.transactionItems.where('transaction_id').anyOf(transactionIds).toArray() : [],
      invoiceIds.length ? db.salesDocumentItems.where('document_id').anyOf(invoiceIds).toArray() : [],
      returns.length ? db.salesReturnItems.where('return_id').anyOf(returns.map((item) => item.id)).toArray() : [],
      db.transactions.bulkGet([...new Set(returns.filter((item) => item.source_type === 'POS_TRANSACTION').map((item) => item.source_id))]),
      db.salesDocuments.bulkGet([...new Set(returns.filter((item) => item.source_type === 'SALES_INVOICE').map((item) => item.source_id))]),
    ]);
    const posReturnIds = new Set(returns.filter((item) => item.source_type === 'POS_TRANSACTION').map((item) => item.id));
    const sourceItems = await db.transactionItems.bulkGet([...new Set(returnItems.filter((item) => posReturnIds.has(item.return_id)).map((item) => item.source_item_id))]);
    return { range, days, generatedAt: new Date().toISOString(), rows: buildSlowMovingRows({
      products, range, conversions: conversions.length ? conversions : DEFAULT_CONVERSIONS,
      transactions: [...transactions, ...returnTransactions.filter((item) => item !== undefined)],
      transactionItems: [...new Map([...transactionItems, ...sourceItems.filter((item) => item !== undefined)].map((item) => [item.id, item])).values()],
      invoices: [...invoices, ...returnInvoices.filter((item) => item !== undefined)],
      invoiceItems, returns, returnItems,
    }) };
  });
};
