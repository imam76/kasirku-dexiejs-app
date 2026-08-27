import { db } from '@/lib/db';
import { getBusinessDayBoundsIso, toBusinessDatePrefix } from '@/utils/businessDate';

export const createSalesReturnNumber = async (date = new Date()) => {
  const prefix = 'SR';
  const datePart = toBusinessDatePrefix(date);
  const { startIso, endIso } = getBusinessDayBoundsIso(date);

  const count = await db.salesReturns
    .where('created_at')
    .between(startIso, endIso, true, true)
    .and((salesReturn) => salesReturn.return_number.startsWith(`${prefix}-${datePart}`))
    .count();

  return `${prefix}-${datePart}-${String(count + 1).padStart(4, '0')}`;
};
