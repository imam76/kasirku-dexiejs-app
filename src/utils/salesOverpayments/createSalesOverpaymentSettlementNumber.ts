import { db } from '@/lib/db';
import { getBusinessDayBoundsIso, toBusinessDatePrefix } from '@/utils/businessDate';

export const createSalesOverpaymentSettlementNumber = async (date = new Date()) => {
  const prefix = 'SOP';
  const datePart = toBusinessDatePrefix(date);
  const { startIso, endIso } = getBusinessDayBoundsIso(date);

  const count = await db.salesOverpaymentSettlements
    .where('created_at')
    .between(startIso, endIso, true, true)
    .and((settlement) => settlement.settlement_number.startsWith(`${prefix}-${datePart}`))
    .count();

  return `${prefix}-${datePart}-${String(count + 1).padStart(4, '0')}`;
};
