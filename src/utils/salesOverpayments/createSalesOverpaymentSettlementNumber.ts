import { db } from '@/lib/db';

export const createSalesOverpaymentSettlementNumber = async (date = new Date()) => {
  const prefix = 'SOP';
  const datePart = date.toISOString().slice(0, 10).replace(/-/g, '');
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(date);
  dayEnd.setHours(23, 59, 59, 999);

  const count = await db.salesOverpaymentSettlements
    .where('created_at')
    .between(dayStart.toISOString(), dayEnd.toISOString(), true, true)
    .and((settlement) => settlement.settlement_number.startsWith(`${prefix}-${datePart}`))
    .count();

  return `${prefix}-${datePart}-${String(count + 1).padStart(4, '0')}`;
};
