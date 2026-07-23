import type { AppliedPromoSnapshot, Promo } from '@/types';
import { formatCurrency } from '@/utils/formatters';

export interface PosVoucherOption {
  value: string;
  label: string;
  searchText: string;
}

export const buildPosVoucherOptions = (promos: Promo[]): PosVoucherOption[] => {
  const optionsByCode = new Map<string, PosVoucherOption>();

  promos.forEach((promo) => {
    const code = promo.voucher_code?.trim().toUpperCase();
    if (!code || optionsByCode.has(code)) return;
    const discountLabel = promo.type === 'percent'
      ? `${promo.value}%`
      : `Rp ${formatCurrency(promo.value)}`;

    optionsByCode.set(code, {
      value: code,
      label: `${code} — ${promo.name} (${discountLabel})`,
      searchText: `${code} ${promo.name} ${discountLabel}`.toLowerCase(),
    });
  });

  return [...optionsByCode.values()];
};

export const calculatePosDiscountTotal = (discounts: Array<{ amount: number }>) => (
  discounts.reduce((sum, discount) => sum + Number(discount.amount || 0), 0)
);

export const isAppliedPosVoucher = (
  voucherCode: string,
  appliedPromos: AppliedPromoSnapshot[],
) => {
  const normalizedVoucherCode = voucherCode.trim().toLowerCase();
  if (!normalizedVoucherCode) return false;

  return appliedPromos.some((promo) => (
    promo.voucher_code?.trim().toLowerCase() === normalizedVoucherCode
  ));
};
