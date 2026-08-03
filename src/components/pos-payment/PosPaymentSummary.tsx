import { useI18n } from '@/hooks/useI18n';
import { formatCurrency } from '@/utils/formatters';

interface PosPaymentSummaryProps {
  total: number;
  discountAmount: number;
  totalPaid: number;
  remainingAmount: number;
  changeAmount: number;
}

export default function PosPaymentSummary({
  total,
  discountAmount,
  totalPaid,
  remainingAmount,
  changeAmount,
}: PosPaymentSummaryProps) {
  const { t } = useI18n();
  const showRemaining = totalPaid > 0 && remainingAmount > 0;
  const hasSettlementDetail = showRemaining || changeAmount > 0;

  return (
    <div data-testid="pos-payment-summary" className="space-y-2 px-0.5 py-1 text-sm">
      <div className="flex items-center justify-between gap-4 text-slate-600">
        <span>{t('cart.total')}</span>
        <strong className="shrink-0 tabular-nums text-slate-950">Rp {formatCurrency(total)}</strong>
      </div>
      <div data-testid="pos-payment-discount" className="flex items-center justify-between gap-4 text-slate-600">
        <span>{t('cart.discount')}</span>
        <strong className="shrink-0 tabular-nums text-slate-950">-Rp {formatCurrency(discountAmount)}</strong>
      </div>
      <div className="flex items-center justify-between gap-4 text-slate-600">
        <span>{t('payment.totalPaid')}</span>
        <strong className="shrink-0 tabular-nums text-slate-950">Rp {formatCurrency(totalPaid)}</strong>
      </div>

      {hasSettlementDetail ? (
        <div aria-live="polite" className="space-y-2 border-t border-slate-200 pt-2">
          {showRemaining ? (
            <div className="flex items-center justify-between gap-4 text-amber-700">
              <span>{t('payment.remaining')}</span>
              <strong data-testid="pos-payment-remaining" className="shrink-0 tabular-nums">
                Rp {formatCurrency(remainingAmount)}
              </strong>
            </div>
          ) : null}
          {changeAmount > 0 ? (
            <div className="flex items-center justify-between gap-4 text-emerald-700">
              <span>{t('payment.change')}</span>
              <strong data-testid="pos-payment-change" className="shrink-0 tabular-nums">
                Rp {formatCurrency(changeAmount)}
              </strong>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
