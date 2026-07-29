import { AutoComplete, Button, Input, InputNumber, Modal } from 'antd';
import { Armchair, Banknote, CheckCircle2, CreditCard, Hash, Plus, QrCode, TicketPercent, Trash2, UserRound, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useI18n } from '@/hooks/useI18n';
import type { PosPaymentMethodOption } from '@/hooks/usePosPaymentMethods';
import type { CheckoutPaymentInput } from '@/services/posTransactionPaymentService';
import type { PromoEvaluationResult } from '@/services/promoService';
import type { PosPaymentDraft } from '@/store/transactionStore';
import type { PaymentMethodCategory, Promo, RestaurantOrderRecord } from '@/types';
import { formatCurrency } from '@/utils/formatters';
import { allocatePosPayments } from '@/utils/posSplitPayment';
import { buildPosVoucherOptions, isAppliedPosVoucher } from '@/utils/posVoucher';

interface RestaurantPaymentModalProps {
  open: boolean;
  order?: RestaurantOrderRecord;
  promo: PromoEvaluationResult;
  promos: Promo[];
  voucherCode: string;
  methods: PosPaymentMethodOption[];
  loading?: boolean;
  onVoucherCodeChange: (value: string) => void;
  onCancel: () => void;
  onConfirm: (payments: CheckoutPaymentInput[]) => Promise<boolean>;
}

const getMethodIcon = (category: PaymentMethodCategory) => {
  if (category === 'CASH') return Banknote;
  if (category === 'QRIS') return QrCode;
  return CreditCard;
};

export function RestaurantPaymentModal({
  open,
  order,
  promo,
  promos,
  voucherCode,
  methods,
  loading,
  onVoucherCodeChange,
  onCancel,
  onConfirm,
}: RestaurantPaymentModalProps) {
  const { t } = useI18n();
  const validMethods = useMemo(() => methods.filter((option) => option.isValid), [methods]);
  const voucherOptions = useMemo(() => buildPosVoucherOptions(promos), [promos]);
  const defaultMethod = validMethods.find((option) => option.method.code.toUpperCase() === 'TUNAI')
    ?? validMethods[0];
  const total = promo.total_amount;
  const [paymentDrafts, setPaymentDrafts] = useState<PosPaymentDraft[]>(() => defaultMethod ? [{
    clientId: crypto.randomUUID(),
    paymentMethodId: defaultMethod.method.id,
    amount: String(total),
    reference: '',
    isAmountAutoFilled: true,
  }] : []);
  const voucherValue = voucherCode.trim();
  const hasAppliedVoucher = isAppliedPosVoucher(voucherValue, promo.applied_promos_snapshot);
  const effectivePaymentDrafts = useMemo(() => {
    const last = paymentDrafts[paymentDrafts.length - 1];
    if (!last?.isAmountAutoFilled) return paymentDrafts;
    const precedingPreview = allocatePosPayments(
      total,
      paymentDrafts.slice(0, -1).map((draft) => ({
        key: draft.clientId,
        paymentMethodId: draft.paymentMethodId,
        category: validMethods.find((option) => option.method.id === draft.paymentMethodId)?.method.category,
        tenderedAmount: Number(draft.amount),
      })),
      { allowIncomplete: true },
    );
    if (precedingPreview.errors.length > 0) return paymentDrafts;
    const nextAmount = String(precedingPreview.remainingAmount);
    if (last.amount === nextAmount) return paymentDrafts;
    return paymentDrafts.map((draft) => draft.clientId === last.clientId
      ? { ...draft, amount: nextAmount }
      : draft);
  }, [paymentDrafts, total, validMethods]);
  const paymentPreview = useMemo(() => allocatePosPayments(
    total,
    effectivePaymentDrafts.map((draft) => ({
      key: draft.clientId,
      paymentMethodId: draft.paymentMethodId,
      category: validMethods.find((option) => option.method.id === draft.paymentMethodId)?.method.category,
      tenderedAmount: Number(draft.amount),
    })),
    { allowIncomplete: true },
  ), [effectivePaymentDrafts, total, validMethods]);
  const selectedMethodIds = new Set(effectivePaymentDrafts.map((draft) => draft.paymentMethodId).filter(Boolean));
  const referencesValid = effectivePaymentDrafts.every((draft) => {
    const method = validMethods.find((option) => option.method.id === draft.paymentMethodId)?.method;
    return Boolean(method && (!method.requires_reference || draft.reference.trim()));
  });
  const canStartSplit = effectivePaymentDrafts.length === 1
    && Boolean(effectivePaymentDrafts[0]?.isAmountAutoFilled)
    && paymentPreview.errors.length === 0
    && paymentPreview.isComplete;
  const canAddPayment = effectivePaymentDrafts.length < validMethods.length
    && (canStartSplit || (paymentPreview.errors.length === 0 && paymentPreview.remainingAmount > 0));
  const isValid = total > 0
    && paymentPreview.errors.length === 0
    && paymentPreview.isComplete
    && referencesValid;

  const updatePaymentDraft = (clientId: string, patch: Partial<PosPaymentDraft>) => {
    setPaymentDrafts((current) => current.map((draft) => draft.clientId === clientId
      ? { ...draft, ...patch }
      : draft));
  };

  const addPaymentDraft = () => {
    if (!canAddPayment) return;
    setPaymentDrafts((current) => {
      const shouldOpenInitialSplit = current.length === 1 && current[0]?.isAmountAutoFilled;
      const preceding = shouldOpenInitialSplit
        ? current.map((draft) => ({ ...draft, amount: '', isAmountAutoFilled: false }))
        : current;
      return [...preceding, {
        clientId: crypto.randomUUID(),
        paymentMethodId: undefined,
        amount: String(shouldOpenInitialSplit ? total : paymentPreview.remainingAmount),
        reference: '',
        isAmountAutoFilled: true,
      }];
    });
  };

  const removePaymentDraft = (clientId: string) => {
    setPaymentDrafts((current) => current.filter((draft) => draft.clientId !== clientId));
  };

  return (
    <Modal
      open={open}
      onCancel={loading ? undefined : onCancel}
      footer={null}
      centered
      width={920}
      destroyOnHidden
      title={t('restaurantPos.paymentTitle')}
      maskClosable={!loading}
      closable={!loading}
      styles={{
        body: {
          overflow: 'hidden',
          paddingBottom: 0,
        },
      }}
    >
      <div className="flex max-h-[calc(100dvh-160px)] min-h-0 flex-col pt-2 min-[768px]:max-h-none">
        <div data-testid="restaurant-payment-scroll-area" className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain pb-4 pr-1 min-[768px]:overflow-visible min-[768px]:pb-3 min-[768px]:pr-0">
        <div className="space-y-3 min-[768px]:grid min-[768px]:grid-cols-2 min-[768px]:gap-3 min-[768px]:space-y-0">
        <div className="flex min-w-0 items-center gap-2.5 overflow-hidden rounded-xl bg-gradient-to-r from-blue-700 via-blue-600 to-indigo-700 p-3 text-white shadow-md shadow-blue-900/10 ring-1 ring-blue-500/20">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/15 ring-1 ring-inset ring-white/20">
            <UserRound size={17} strokeWidth={2.25} />
          </div>
          <p className="min-w-0 flex-1 truncate text-sm font-black">{order?.customer_name || order?.order_number}</p>
          <div className="flex min-w-0 shrink-0 items-center gap-1.5 text-[11px] font-bold">
            <span className="inline-flex max-w-36 min-w-0 items-center gap-1 rounded-md bg-white/10 px-2 py-1 ring-1 ring-inset ring-white/15">
              <Hash size={11} className="shrink-0 text-blue-100" />
              <span className="truncate">{order?.order_number}</span>
            </span>
            <span className="inline-flex max-w-28 min-w-0 items-center gap-1 rounded-md bg-white/10 px-2 py-1 ring-1 ring-inset ring-white/15">
              <Armchair size={11} className="shrink-0 text-blue-100" />
              <span className="truncate">{order?.table_name ?? t('restaurantPos.counterDestination')}</span>
            </span>
          </div>
        </div>

        <section className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex shrink-0 items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">
              <TicketPercent size={14} className="text-blue-600" />
              <span>{t('restaurantPos.voucherAndDiscount')}</span>
            </div>
            <AutoComplete
              allowClear
              value={voucherCode || undefined}
              options={voucherOptions}
              onChange={(value) => onVoucherCodeChange(String(value ?? ''))}
              filterOption={(input, option) => String(option?.searchText ?? option?.label ?? '')
                .toLowerCase()
                .includes(input.trim().toLowerCase())}
              placeholder={t('promo.voucherPlaceholder')}
              notFoundContent={t('restaurantPos.voucherManualEntry')}
              className="ml-auto w-48 min-w-0 flex-none"
            />
          </div>
          {promo.discount_breakdown.length > 0 ? (
            <div className="mt-2 space-y-1.5 rounded-lg border border-emerald-100 bg-emerald-50/70 px-3 py-2 text-xs">
              {promo.discount_breakdown.map((discount) => (
                <div key={discount.label} className="flex justify-between gap-3 font-semibold text-emerald-700">
                  <span className="truncate">{discount.label}</span>
                  <span className="shrink-0">-Rp {formatCurrency(discount.amount)}</span>
                </div>
              ))}
            </div>
          ) : null}
          {voucherValue && !hasAppliedVoucher ? (
            <p className="mt-2 text-xs text-slate-500">{t('promo.noVoucherDiscount')}</p>
          ) : null}
        </section>
        </div>

        {validMethods.length === 0 ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-700">{t('restaurantPos.noPaymentMethods')}</div>
        ) : (
          <div className="space-y-3">
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">{t('restaurantPos.paymentMethod')}</p>
            <div className={effectivePaymentDrafts.length === 2
              ? 'grid gap-2 min-[768px]:grid-cols-2'
              : effectivePaymentDrafts.length > 2
                ? 'grid gap-2 min-[768px]:grid-cols-2 min-[1024px]:grid-cols-3'
                : undefined}
            >
            {effectivePaymentDrafts.map((draft, index) => {
              const selectedMethod = validMethods.find((option) => option.method.id === draft.paymentMethodId)?.method;
              const line = paymentPreview.lines[index];
              const visibleError = line?.error?.startsWith('Nominal pembayaran ') ? undefined : line?.error;
              return (
                <div key={draft.clientId} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm min-[768px]:p-2.5">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <span className="text-xs font-black uppercase tracking-wide text-slate-500">
                      {t('restaurantPos.paymentAllocation')} {index + 1}
                    </span>
                    {effectivePaymentDrafts.length > 1 ? (
                      <button
                        type="button"
                        onClick={() => removePaymentDraft(draft.clientId)}
                        className="grid h-7 w-7 place-items-center rounded-lg border border-red-200 bg-red-50 text-red-600 transition hover:border-red-300 hover:bg-red-100"
                        aria-label={t('payment.remove')}
                        title={t('payment.remove')}
                      >
                        <Trash2 size={14} />
                      </button>
                    ) : null}
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {validMethods.map((option) => {
                      const method = option.method;
                      const Icon = getMethodIcon(method.category);
                      const active = method.id === draft.paymentMethodId;
                      const usedByAnotherPayment = selectedMethodIds.has(method.id) && !active;
                      return (
                        <button
                          key={method.id}
                          type="button"
                          aria-pressed={active}
                          disabled={usedByAnotherPayment}
                          onClick={() => updatePaymentDraft(draft.clientId, {
                            paymentMethodId: method.id,
                            reference: method.requires_reference ? draft.reference : '',
                          })}
                          className={`flex min-h-10 items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left transition disabled:cursor-not-allowed disabled:opacity-35 ${active ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-100' : 'border-slate-200 hover:border-blue-300'}`}
                        >
                          <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-md ${active ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}><Icon size={14} /></span>
                          <p className="min-w-0 truncate text-xs font-black text-slate-900">{method.name}</p>
                        </button>
                      );
                    })}
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-4">
                    <label className="text-sm font-bold text-slate-700">{t('payment.amountPlaceholder')}</label>
                    <InputNumber<number>
                      min={0}
                      value={draft.amount === '' ? null : Number(draft.amount)}
                      prefix="Rp"
                      status={line?.error?.startsWith('Nominal pembayaran ') ? 'error' : undefined}
                      className="w-48"
                      formatter={(value) => formatCurrency(Number(value ?? 0))}
                      parser={(value) => Number(String(value ?? '').replace(/\D/g, ''))}
                      onChange={(value) => updatePaymentDraft(draft.clientId, {
                        amount: value === null ? '' : String(value),
                        isAmountAutoFilled: false,
                      })}
                    />
                  </div>
                  {selectedMethod?.requires_reference ? (
                    <Input
                      value={draft.reference}
                      maxLength={100}
                      status={!draft.reference.trim() ? 'error' : undefined}
                      placeholder={t('payment.referencePlaceholder')}
                      onChange={(event) => updatePaymentDraft(draft.clientId, { reference: event.target.value })}
                      className="mt-2"
                    />
                  ) : null}
                  {visibleError ? <p className="mt-2 text-xs font-semibold text-red-600">{visibleError}</p> : null}
                </div>
              );
            })}
            </div>
            {canAddPayment ? (
              <Button block icon={<Plus size={16} />} onClick={addPaymentDraft} className="!border-blue-200 !font-bold !text-blue-700">
                {t('payment.add')}
              </Button>
            ) : null}
          </div>
        )}

        <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-3 min-[768px]:grid min-[768px]:grid-cols-2 min-[768px]:gap-3">
          <div className="space-y-2 border-b border-blue-100 pb-3 text-sm min-[768px]:border-b-0 min-[768px]:border-r min-[768px]:pb-0 min-[768px]:pr-3">
            <div className="flex justify-between"><span className="text-slate-500">{t('restaurantPos.total')}</span><span className="font-black text-slate-900">Rp {formatCurrency(total)}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">{t('restaurantPos.discount')}</span><span className="font-bold text-emerald-700">-Rp {formatCurrency(promo.discount_amount)}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">{t('payment.totalPaid')}</span><span className="font-bold text-slate-900">Rp {formatCurrency(paymentPreview.totalTendered)}</span></div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 min-[768px]:mt-0">
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5">
              <p className="text-[10px] font-black uppercase tracking-wide text-amber-700">{t('payment.remaining')}</p>
              <p className="mt-1 truncate text-base font-black tabular-nums text-amber-950">Rp {formatCurrency(paymentPreview.remainingAmount)}</p>
            </div>
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2.5">
              <p className="text-[10px] font-black uppercase tracking-wide text-emerald-700">{t('restaurantPos.change')}</p>
              <p className="mt-1 truncate text-base font-black tabular-nums text-emerald-950">Rp {formatCurrency(paymentPreview.totalChange)}</p>
            </div>
          </div>
        </div>
        </div>

        <div data-testid="restaurant-payment-actions" className="sticky bottom-0 z-20 grid shrink-0 grid-cols-[1fr_2fr] gap-2 border-t border-slate-200 bg-white pb-4 pt-3 shadow-[0_-8px_18px_-14px_rgba(15,23,42,0.25)]">
          <Button size="large" icon={<X size={16} />} disabled={loading} onClick={onCancel}>{t('common.cancel')}</Button>
          <Button
            type="primary"
            size="large"
            icon={<CheckCircle2 size={16} />}
            disabled={!isValid}
            loading={loading}
            onClick={() => {
              if (!isValid) return;
              void onConfirm(effectivePaymentDrafts.map((draft) => ({
                paymentMethodId: draft.paymentMethodId ?? '',
                tenderedAmount: Number(draft.amount),
                paymentReference: draft.reference.trim() || undefined,
              })));
            }}
            className={isValid
              ? '!border-blue-600 !bg-blue-600 !font-bold !text-white hover:!border-blue-700 hover:!bg-blue-700'
              : '!cursor-not-allowed !border-slate-300 !bg-slate-200 !font-bold !text-slate-500 !shadow-none'}
          >
            {t('restaurantPos.confirmPayment')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
