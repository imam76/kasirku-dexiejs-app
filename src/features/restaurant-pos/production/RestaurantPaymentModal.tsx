import { AutoComplete, Button, Dropdown, Input, InputNumber, Modal } from 'antd';
import { Armchair, Banknote, CheckCircle2, ChevronDown, CreditCard, Hash, NotebookPen, Plus, QrCode, TicketPercent, Trash2, UserRound, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';
import { useI18n } from '@/hooks/useI18n';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import type { PosPaymentMethodOption } from '@/hooks/usePosPaymentMethods';
import type { CheckoutPaymentInput } from '@/services/posTransactionPaymentService';
import type { PromoEvaluationResult } from '@/services/promoService';
import type { PosPaymentDraft } from '@/store/transactionStore';
import type { PaymentMethodCategory, Promo, RestaurantOrderRecord } from '@/types';
import { formatCurrency } from '@/utils/formatters';
import { allocatePosPayments } from '@/utils/posSplitPayment';
import { buildPosVoucherOptions, isAppliedPosVoucher } from '@/utils/posVoucher';
import PosPaymentSummary from '@/components/pos-payment/PosPaymentSummary';

const DESKTOP_VIEWPORT_QUERY = '(min-width: 1280px)';

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
  onRecordExpense: () => Promise<boolean>;
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
  onRecordExpense,
}: RestaurantPaymentModalProps) {
  const { t } = useI18n();
  const isDesktopViewport = useMediaQuery(DESKTOP_VIEWPORT_QUERY);
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
  const hasStartedPayment = effectivePaymentDrafts.some((draft) => {
    const amount = Number(draft.amount);
    return Number.isFinite(amount) && amount > 0;
  });
  const canAddPayment = effectivePaymentDrafts.length < validMethods.length
    && hasStartedPayment
    && paymentPreview.errors.length === 0
    && paymentPreview.remainingAmount > 0;
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
    setPaymentDrafts((current) => [...current, {
      clientId: crypto.randomUUID(),
      paymentMethodId: undefined,
      amount: String(paymentPreview.remainingAmount),
      reference: '',
      isAmountAutoFilled: true,
    }]);
  };

  const removePaymentDraft = (clientId: string) => {
    setPaymentDrafts((current) => current.filter((draft) => draft.clientId !== clientId));
  };

  const submitPayment = () => {
    if (!isValid || loading) return;
    void onConfirm(effectivePaymentDrafts.map((draft) => ({
      paymentMethodId: draft.paymentMethodId ?? '',
      tenderedAmount: Number(draft.amount),
      paymentReference: draft.reference.trim() || undefined,
    })));
  };

  useHotkeys('mod+enter', () => submitPayment(), {
    enabled: open,
    enableOnFormTags: true,
    preventDefault: true,
  }, [isValid, loading, open, submitPayment]);

  useHotkeys('f9', () => addPaymentDraft(), {
    enabled: open,
    enableOnFormTags: true,
    preventDefault: true,
  }, [addPaymentDraft, canAddPayment, open]);

  // Sengaja TANPA enableOnFormTags: begitu fokus ada di kolom nominal, angka
  // harus tetap bisa diketik sebagai nominal, bukan memilih ulang metode.
  // Baris yang dipilih shortcut ini selalu baris TERAKHIR (mengikuti pola
  // yang sama di PosSplitPaymentEditor untuk kasir retail).
  useHotkeys(['1', '2', '3', '4', '5', '6', '7', '8', '9'], (event) => {
    const targetDraft = effectivePaymentDrafts[effectivePaymentDrafts.length - 1];
    if (!targetDraft) return;

    const method = validMethods[Number(event.key) - 1]?.method;
    if (!method) return;

    const usedByAnotherDraft = effectivePaymentDrafts.some((draft) => (
      draft.clientId !== targetDraft.clientId && draft.paymentMethodId === method.id
    ));
    if (usedByAnotherDraft) return;

    updatePaymentDraft(targetDraft.clientId, {
      paymentMethodId: method.id,
      reference: method.requires_reference ? targetDraft.reference : '',
    });
  }, {
    enabled: open,
    preventDefault: true,
  }, [effectivePaymentDrafts, open, validMethods]);

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
                    {validMethods.map((option, methodIndex) => {
                      const method = option.method;
                      const Icon = getMethodIcon(method.category);
                      const active = method.id === draft.paymentMethodId;
                      const usedByAnotherPayment = selectedMethodIds.has(method.id) && !active;
                      const isLastDraft = index === effectivePaymentDrafts.length - 1;
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
                          <p className="min-w-0 flex-1 truncate text-xs font-black text-slate-900">{method.name}</p>
                          {isLastDraft && methodIndex < 9 && (
                            <kbd className="ml-auto hidden shrink-0 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[10px] font-semibold leading-none text-slate-500 sm:inline-block">
                              {methodIndex + 1}
                            </kbd>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  <div className="mt-3 space-y-1.5">
                    <label className="block text-sm font-bold text-slate-700">{t('payment.amountPlaceholder')}</label>
                    <InputNumber<number>
                      min={0}
                      value={draft.amount === '' ? null : Number(draft.amount)}
                      prefix="Rp"
                      status={line?.error?.startsWith('Nominal pembayaran ') ? 'error' : undefined}
                      className="w-full"
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
                {' '}
                <kbd className="rounded border border-blue-200 bg-white px-1.5 py-0.5 font-mono text-[10px] font-semibold leading-none text-blue-700">F9</kbd>
              </Button>
            ) : null}
          </div>
        )}

        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">{t('payment.billingInformation')}</p>
          <PosPaymentSummary
            total={total}
            discountAmount={promo.discount_amount}
            totalPaid={paymentPreview.totalTendered}
            remainingAmount={paymentPreview.remainingAmount}
            changeAmount={paymentPreview.totalChange}
          />
        </div>
        </div>

        <div
          data-testid="restaurant-payment-actions"
          className={`sticky bottom-0 z-20 grid shrink-0 gap-2 border-t border-slate-200 bg-white pb-4 pt-3 shadow-[0_-8px_18px_-14px_rgba(15,23,42,0.25)] ${isDesktopViewport
            ? 'grid-cols-[1fr_2fr]'
            : 'grid-cols-[auto_minmax(5rem,1fr)_minmax(0,2fr)]'}`}
        >
          {!isDesktopViewport ? (
            <Button
              size="large"
              type="text"
              icon={<NotebookPen size={16} />}
              disabled={loading}
              onClick={() => void onRecordExpense()}
              title={t('payment.recordExpense')}
              aria-label={t('payment.recordExpense')}
              className="!px-2 !font-semibold !text-amber-700 hover:!bg-amber-50"
            >
              <span className="hidden whitespace-nowrap sm:inline">{t('payment.recordExpense')}</span>
              <span className="whitespace-nowrap sm:hidden">{t('payment.expense')}</span>
            </Button>
          ) : null}
          <Button size="large" icon={<X size={16} />} disabled={loading} onClick={onCancel}>{t('common.cancel')}</Button>
          <div className="flex min-w-0">
            <Button
              type="primary"
              size="large"
              icon={<CheckCircle2 size={16} />}
              disabled={!isValid}
              loading={loading}
              onClick={submitPayment}
              className={`${isValid
                ? '!border-blue-600 !bg-blue-600 !text-white hover:!border-blue-700 hover:!bg-blue-700'
                : '!cursor-not-allowed !border-slate-300 !bg-slate-200 !text-slate-500 !shadow-none'} !min-w-0 !flex-1 !font-bold ${isDesktopViewport ? '!rounded-r-none' : ''}`}
            >
              <span className="truncate">{t('restaurantPos.confirmPayment')}</span>
              {isDesktopViewport && (
                <kbd className="hidden shrink-0 rounded border border-white/30 bg-white/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold leading-none text-white/90 sm:inline-block">Ctrl+Enter</kbd>
              )}
            </Button>
            {isDesktopViewport ? (
              <Dropdown
              trigger={['click']}
              placement="topRight"
              overlayStyle={{ zIndex: 1200 }}
              menu={{
                items: [
                  {
                    key: 'confirm-payment',
                    icon: <CheckCircle2 size={15} />,
                    label: t('restaurantPos.confirmPayment'),
                    disabled: !isValid || loading,
                  },
                  { type: 'divider' },
                  {
                    key: 'record-expense',
                    icon: <NotebookPen size={15} className="text-amber-600" />,
                    label: t('payment.recordExpense'),
                    disabled: loading,
                  },
                ],
                onClick: ({ key }) => {
                  if (key === 'confirm-payment') submitPayment();
                  if (key === 'record-expense' && !loading) void onRecordExpense();
                },
              }}
            >
              <Button
                type="primary"
                size="large"
                icon={<ChevronDown size={17} />}
                disabled={loading}
                title={t('payment.moreActions')}
                aria-label={t('payment.moreActions')}
                className="!rounded-l-none !border-l-blue-500 !px-3"
              />
              </Dropdown>
            ) : null}
          </div>
        </div>
      </div>
    </Modal>
  );
}
