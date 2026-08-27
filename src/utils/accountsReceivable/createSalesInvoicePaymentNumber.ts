import { db } from '@/lib/db';
import { getBusinessDayBoundsIso, toBusinessDatePrefix } from '@/utils/businessDate';

export const createSalesInvoicePaymentNumber = async (date = new Date()) => {
  const prefix = 'ARP';
  const datePart = toBusinessDatePrefix(date);
  const { startIso, endIso } = getBusinessDayBoundsIso(date);

  const count = await db.salesInvoicePayments
    .where('created_at')
    .between(startIso, endIso, true, true)
    .and((payment) => (
      payment.payment_number?.startsWith(`${prefix}-${datePart}`) ||
      payment.id.startsWith(`${prefix}-${datePart}`)
    ))
    .count();

  return `${prefix}-${datePart}-${String(count + 1).padStart(4, '0')}`;
};
