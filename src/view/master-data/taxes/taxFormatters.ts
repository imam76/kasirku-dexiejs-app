import dayjs from '@/lib/dayjs';
import type { Tax } from '@/types';

export const getTaxPeriodLabel = (tax: Tax) => {
  if (!tax.effective_from && !tax.effective_to) return '-';

  const startDate = tax.effective_from ? dayjs(tax.effective_from).format('DD MMM YYYY') : '-';
  const endDate = tax.effective_to ? dayjs(tax.effective_to).format('DD MMM YYYY') : '-';

  return `${startDate} - ${endDate}`;
};
