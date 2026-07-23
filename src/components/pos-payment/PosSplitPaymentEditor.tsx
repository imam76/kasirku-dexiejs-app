import { useEffect, useState, type ReactNode } from 'react';
import { Alert, Input, Select, Switch } from 'antd';
import { CheckCircle2, DollarSign, Plus, Trash2, X } from 'lucide-react';
import type { PosPaymentMethodOption } from '@/hooks/usePosPaymentMethods';
import type { PosPaymentDraft } from '@/store/transactionStore';
import type { PosPaymentAllocationResult } from '@/utils/posSplitPayment';
import { formatCurrency } from '@/utils/formatters';
import { useI18n } from '@/hooks/useI18n';

const PAYMENT_SHORTCUTS_STORAGE_KEY = 'frayukti-show-payment-shortcuts';
const QUICK_AMOUNTS = [5000, 10000, 20000, 50000, 100000];
const PAYMENT_SHORTCUT_CLASS = 'flex min-h-9 items-center justify-center gap-1 rounded-lg border border-blue-100 bg-white px-1.5 py-2 text-[10px] font-semibold tabular-nums text-slate-700 transition hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700';

interface Props {
  total: number;
  discountAmount: number;
  drafts: PosPaymentDraft[];
  methods: PosPaymentMethodOption[];
  preview: PosPaymentAllocationResult;
  scrollHeader?: ReactNode;
  onAdd: () => void;
  onUpdate: (clientId: string, patch: Partial<PosPaymentDraft>) => void;
  onRemove: (clientId: string) => void;
  onConfirm: () => Promise<boolean>;
  onCancel: () => void;
}

export default function PosSplitPaymentEditor({
  total,
  discountAmount,
  drafts,
  methods,
  preview,
  scrollHeader,
  onAdd,
  onUpdate,
  onRemove,
  onConfirm,
  onCancel,
}: Props) {
  const { t } = useI18n();
  const [showPaymentShortcuts, setShowPaymentShortcuts] = useState(() => {
    const saved = localStorage.getItem(PAYMENT_SHORTCUTS_STORAGE_KEY);
    return saved === null ? true : saved === 'true';
  });

  useEffect(() => {
    localStorage.setItem(PAYMENT_SHORTCUTS_STORAGE_KEY, String(showPaymentShortcuts));
  }, [showPaymentShortcuts]);

  const selectedIds = new Set(drafts.map((draft) => draft.paymentMethodId).filter(Boolean));
  const referencesValid = drafts.every((draft) => {
    const option = methods.find((item) => item.method.id === draft.paymentMethodId);
    return Boolean(option?.isValid && (!option.method.requires_reference || draft.reference.trim()));
  });
  const canConfirm = preview.errors.length === 0 && preview.isComplete && referencesValid;
  const canAdd = preview.errors.length === 0
    && preview.remainingAmount > 0
    && selectedIds.size < methods.filter((method) => method.isValid).length;

  if (methods.length === 0) {
    return <Alert type="error" showIcon message={t('payment.noMethodAvailable')} />;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div
        data-testid="pos-payment-scroll-area"
        className="space-y-4 min-[1024px]:min-h-0 min-[1024px]:flex-1 min-[1024px]:overflow-y-auto min-[1024px]:overscroll-contain min-[1024px]:pb-3 min-[1024px]:pr-1 lg:contents"
      >
        {scrollHeader}
        <div
          data-testid="pos-payment-summary"
          className="rounded-xl border border-slate-200 bg-slate-50 p-3 shadow-sm"
        >
        <div className="space-y-2 border-b border-slate-200 pb-3 text-sm">
          <div className="flex items-center justify-between gap-3 text-slate-600">
            <span>{t('cart.total')}</span>
            <strong className="tabular-nums text-slate-950">Rp {formatCurrency(total)}</strong>
          </div>
          <div data-testid="pos-payment-discount" className="flex items-center justify-between gap-3 text-emerald-700">
            <span>{t('cart.discount')}</span>
            <strong className="tabular-nums">-Rp {formatCurrency(discountAmount)}</strong>
          </div>
          <div className="flex items-center justify-between gap-3 text-slate-600">
            <span>{t('payment.totalPaid')}</span>
            <strong className="tabular-nums text-slate-950">Rp {formatCurrency(preview.totalTendered)}</strong>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">{t('payment.remaining')}</div>
            <div data-testid="pos-payment-remaining" className="mt-1 break-words text-base font-bold tabular-nums text-amber-950">
              Rp {formatCurrency(preview.remainingAmount)}
            </div>
          </div>
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2.5">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">{t('payment.change')}</div>
            <div data-testid="pos-payment-change" className="mt-1 break-words text-base font-bold tabular-nums text-emerald-950">
              Rp {formatCurrency(preview.totalChange)}
            </div>
          </div>
        </div>
        </div>

        <div
          data-testid="pos-payment-method-grid"
          className={drafts.length > 1
            ? 'space-y-4 min-[1024px]:grid min-[1024px]:grid-cols-2 min-[1024px]:gap-4 min-[1024px]:space-y-0 lg:block lg:space-y-4'
            : undefined}
        >
          {drafts.map((draft, index) => {
            const option = methods.find((item) => item.method.id === draft.paymentMethodId);
            const method = option?.method;
            const line = preview.lines[index];
            const numericAmount = Number(draft.amount);
            const currentAmount = Number.isFinite(numericAmount) ? numericAmount : 0;
            const visibleLineError = line?.error?.startsWith('Nominal pembayaran ')
              ? undefined
              : line?.error;
            return (
              <div
                key={draft.clientId}
                data-testid={`pos-payment-row-${index}`}
                className={`rounded-xl border-2 p-3 shadow-sm ${
                  index === 0
                    ? 'border-blue-200 bg-blue-50/80'
                    : 'border-violet-200 bg-violet-50/80'
                }`}
              >
            <div className="flex items-center gap-2">
              <Select
                data-testid={`pos-payment-method-${index}`}
                className="min-w-0 flex-1"
                styles={{ popup: { root: { zIndex: 1200 } } }}
                value={draft.paymentMethodId}
                placeholder={t('report.paymentMethod')}
                onChange={(paymentMethodId) => {
                  const next = methods.find((item) => item.method.id === paymentMethodId)?.method;
                  onUpdate(draft.clientId, {
                    paymentMethodId,
                    reference: next?.requires_reference ? draft.reference : '',
                  });
                }}
                options={methods.map((item) => ({
                  value: item.method.id,
                  label: item.method.name,
                  disabled: !item.isValid || (selectedIds.has(item.method.id) && item.method.id !== draft.paymentMethodId),
                  title: item.disabledReason,
                }))}
              />
              {drafts.length > 1 && (
                <button
                  type="button"
                  data-testid={`pos-payment-remove-${index}`}
                  onClick={() => onRemove(draft.clientId)}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-red-300 bg-red-100 text-red-700 shadow-sm transition-colors hover:border-red-400 hover:bg-red-200 hover:text-red-800"
                  aria-label={t('payment.remove')}
                  title={t('payment.remove')}
                >
                  <Trash2 size={17} />
                </button>
              )}
            </div>
            {method?.requires_reference && (
              <Input
                data-testid={`pos-payment-reference-${index}`}
                className="mt-2"
                value={draft.reference}
                maxLength={100}
                status={!draft.reference.trim() ? 'error' : undefined}
                placeholder={t('payment.referencePlaceholder')}
                onChange={(event) => onUpdate(draft.clientId, { reference: event.target.value })}
              />
            )}
            <div className="mt-2 flex items-stretch gap-2">
              <input
                data-testid={`pos-payment-amount-${index}`}
                type="number"
                min="0"
                value={draft.amount}
                placeholder={t('payment.amountPlaceholder')}
                onChange={(event) => onUpdate(draft.clientId, { amount: event.target.value, isAmountAutoFilled: false })}
                className={`min-w-0 flex-1 rounded-lg border px-3 py-2 ${visibleLineError ? 'border-red-400' : 'border-gray-300'}`}
              />
              {method?.category === 'CASH' && (
                <button
                  type="button"
                  onClick={() => onUpdate(draft.clientId, { amount: '', isAmountAutoFilled: false })}
                  className="grid w-10 shrink-0 place-items-center rounded-lg border border-red-200 bg-white text-red-600 transition hover:border-red-400 hover:bg-red-50"
                  aria-label={t('cart.clear')}
                  title={t('cart.clear')}
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>
            {method?.category === 'CASH' && (
              <div className="mt-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">{t('payment.shortcuts')}</span>
                  <Switch
                    size="small"
                    checked={showPaymentShortcuts}
                    onChange={setShowPaymentShortcuts}
                  />
                </div>
                {showPaymentShortcuts && (
                  <div className="grid grid-cols-3 gap-1.5">
                    {QUICK_AMOUNTS.map((amount) => (
                      <button
                        key={amount}
                        type="button"
                        onClick={() => onUpdate(draft.clientId, {
                          amount: String(currentAmount + amount),
                          isAmountAutoFilled: false,
                        })}
                        className={PAYMENT_SHORTCUT_CLASS}
                      >
                        +Rp {formatCurrency(amount)}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => onUpdate(draft.clientId, { amount: String(preview.remainingAmount + line!.appliedAmount), isAmountAutoFilled: true })}
                      className={PAYMENT_SHORTCUT_CLASS}
                    >
                      <DollarSign size={13} /> {t('payment.exactAmount')}
                    </button>
                  </div>
                )}
              </div>
            )}
            {visibleLineError && <p className="mt-1 text-xs text-red-600">{visibleLineError}</p>}
              </div>
            );
          })}
        </div>

        {drafts.length === 1 && (
          <button
            type="button"
            data-testid="pos-add-payment"
            disabled={!canAdd}
            onClick={onAdd}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-blue-200 py-2 font-semibold text-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Plus size={17} /> {t('payment.add')}
          </button>
        )}
      </div>

      <div
        data-testid="pos-payment-actions"
        className="sticky bottom-0 z-30 -mx-3 mt-auto grid shrink-0 grid-cols-2 gap-2 border-t border-gray-200 bg-white px-3 pb-3 pt-3 shadow-[0_-8px_18px_-14px_rgba(15,23,42,0.45)] min-[1024px]:static lg:sticky"
      >
        <button type="button" onClick={onCancel} className="flex items-center justify-center gap-1.5 rounded-lg border border-gray-300 bg-white py-2.5 font-semibold text-gray-700 hover:bg-gray-50"><X size={16} /> {t('payment.cancel')}</button>
        <button
          type="button"
          data-testid="pos-confirm-payment"
          disabled={!canConfirm}
          onClick={onConfirm}
          className="flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 py-2.5 font-bold text-white shadow-sm hover:bg-blue-700 disabled:bg-gray-300 disabled:shadow-none"
        >
          <CheckCircle2 size={16} /> {t('payment.confirm')}
        </button>
      </div>
    </div>
  );
}
