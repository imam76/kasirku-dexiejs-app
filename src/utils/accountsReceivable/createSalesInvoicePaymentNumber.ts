import { db } from '@/lib/db';

export const createSalesInvoicePaymentNumber = async (date = new Date()) => {
  const prefix = 'ARP';
  const datePart = date.toISOString().slice(0, 10).replace(/-/g, '');
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(date);
  dayEnd.setHours(23, 59, 59, 999);

  const count = await db.salesInvoicePayments
    .where('created_at')
    .between(dayStart.toISOString(), dayEnd.toISOString(), true, true)
    .and((payment) => (
      payment.payment_number?.startsWith(`${prefix}-${datePart}`) ||
      payment.id.startsWith(`${prefix}-${datePart}`)
    ))
    .count();

  return `${prefix}-${datePart}-${String(count + 1).padStart(4, '0')}`;
};
