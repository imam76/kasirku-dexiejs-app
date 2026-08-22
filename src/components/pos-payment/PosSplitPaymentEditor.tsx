import { useEffect, useState, type ReactNode } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';
import { Alert, Dropdown, Input, InputNumber, Select, Switch } from 'antd';
import { Banknote, CheckCircle2, ChevronDown, CreditCard, DollarSign, NotebookPen, Plus, QrCode, Trash2, X } from 'lucide-react';
import type { PosPaymentMethodOption } from '@/hooks/usePosPaymentMethods';
import type { PosPaymentDraft } from '@/store/transactionStore';
import type { PosPaymentAllocationResult } from '@/utils/posSplitPayment';
import { formatCurrency } from '@/utils/formatters';
import { useI18n } from '@/hooks/useI18n';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import type { PaymentMethodCategory } from '@/types';
import PosPaymentSummary from './PosPaymentSummary';

const PAYMENT_SHORTCUTS_STORAGE_KEY = 'frayukti-show-payment-shortcuts';
const DESKTOP_VIEWPORT_QUERY = '(min-width: 1280px)';
const QUICK_AMOUNTS = [5000, 10000, 20000, 50000, 100000];
const PAYMENT_SHORTCUT_CLASS = 'flex min-h-9 items-center justify-center gap-1 rounded-lg border border-blue-100 bg-white px-1.5 py-2 text-xs font-semibold tabular-nums text-slate-700 transition hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700';

const getMethodIcon = (category: PaymentMethodCategory) => {
  if (category === 'CASH') return Banknote;
  if (category === 'QRIS') return QrCode;
  return CreditCard;
};

interface Props {
  total: number;
  discountAmount: number;
  drafts: PosPaymentDraft[];
  methods: PosPaymentMethodOption[];
  preview: PosPaymentAllocationResult;
  scrollHeader?: ReactNode;
  layout?: 'embedded' | 'dialog';
  showSectionTitles?: boolean;
  confirmLabel?: ReactNode;
  onAdd: () => void;
  onUpdate: (clientId: string, patch: Partial<PosPaymentDraft>) => void;
  onRemove: (clientId: string) => void;
  onConfirm: () => Promise<boolean>;
  onRecordExpense?: () => Promise<boolean>;
  onCancel: () => void;
}

export default function PosSplitPaymentEditor({
  total,
  discountAmount,
  drafts,
  methods,
  preview,
  scrollHeader,
  layout = 'embedded',
  showSectionTitles = false,
  confirmLabel,
  onAdd,
  onUpdate,
  onRemove,
  onConfirm,
  onRecordExpense,
  onCancel,
}: Props) {
  const { t } = useI18n();
  const isDesktopViewport = useMediaQuery(DESKTOP_VIEWPORT_QUERY);
  const [showPaymentShortcuts, setShowPaymentShortcuts] = useState(() => {
    const saved = localStorage.getItem(PAYMENT_SHORTCUTS_STORAGE_KEY);
    return saved === null ? true : saved === 'true';
  });
  const [isRecordingExpense, setIsRecordingExpense] = useState(false);

  useEffect(() => {
    localStorage.setItem(PAYMENT_SHORTCUTS_STORAGE_KEY, String(showPaymentShortcuts));
  }, [showPaymentShortcuts]);

  const selectedIds = new Set(drafts.map((draft) => draft.paymentMethodId).filter(Boolean));
  const validMethodCount = methods.filter((method) => method.isValid).length;
  const hasStartedPayment = drafts.some((draft) => {
    const amount = Number(draft.amount);
    return Number.isFinite(amount) && amount > 0;
  });
  const referencesValid = drafts.every((draft) => {
    const option = methods.find((item) => item.method.id === draft.paymentMethodId);
    return Boolean(option?.isValid && (!option.method.requires_reference || draft.reference.trim()));
  });
  const canConfirm = preview.errors.length === 0 && preview.isComplete && referencesValid;
  const canAdd = hasStartedPayment
    && preview.errors.length === 0
    && preview.remainingAmount > 0
    && drafts.length < validMethodCount;
  const isDialog = layout === 'dialog';
  const hasValidPaymentMethod = methods.some((method) => method.isValid);
  const useSplitAction = isDesktopViewport && Boolean(onRecordExpense);

  // Scoped to the full-screen payment dialog only (layout === 'dialog') so the
  // embedded mobile/tablet payment editor never registers a second listener.
  useHotkeys('mod+enter', () => {
    if (canConfirm) void onConfirm();
  }, {
    enabled: isDialog,
    enableOnFormTags: true,
    preventDefault: true,
  }, [canConfirm, isDialog, onConfirm]);

  useHotkeys('f9', () => {
    if (canAdd) onAdd();
  }, {
    enabled: isDialog,
    enableOnFormTags: true,
    preventDefault: true,
  }, [canAdd, isDialog, onAdd]);

  const validPaymentMethods = methods.filter((item) => item.isValid);

  // Sengaja TANPA enableOnFormTags: begitu fokus pindah ke kolom nominal
  // (InputNumber), react-hotkeys-hook otomatis diam supaya mengetik angka
  // nominal tidak malah memilih ulang metode pembayaran. Baris yang dipilih
  // shortcut ini selalu baris TERAKHIR (paling relevan sesudah F9 menambah
  // baris split baru).
  useHotkeys(['1', '2', '3', '4', '5', '6', '7', '8', '9'], (event) => {
    const targetDraft = drafts[drafts.length - 1];
    if (!targetDraft) return;

    const method = validPaymentMethods[Number(event.key) - 1]?.method;
    if (!method) return;

    const usedByAnotherDraft = drafts.some((draft) => (
      draft.clientId !== targetDraft.clientId && draft.paymentMethodId === method.id
    ));
    if (usedByAnotherDraft) return;

    onUpdate(targetDraft.clientId, {
      paymentMethodId: method.id,
      reference: method.requires_reference ? targetDraft.reference : '',
    });
  }, {
    enabled: isDialog,
    preventDefault: true,
  }, [drafts, isDialog, onUpdate, validPaymentMethods]);

  const handleRecordExpense = async () => {
    if (!onRecordExpense || isRecordingExpense) return;
    setIsRecordingExpense(true);
    try {
      await onRecordExpense();
    } finally {
      setIsRecordingExpense(false);
    }
  };

  if (!hasValidPaymentMethod && !onRecordExpense) {
    return <Alert type="error" showIcon message={t('payment.noMethodAvailable')} />;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div
        data-testid="pos-payment-scroll-area"
        className={isDialog
          ? 'min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain pb-4 pr-1'
          : 'space-y-4 min-[1024px]:min-h-0 min-[1024px]:flex-1 min-[1024px]:overflow-y-auto min-[1024px]:overscroll-contain min-[1024px]:pb-3 min-[1024px]:pr-1 lg:contents'}
      >
        {scrollHeader}
        {!hasValidPaymentMethod ? (
          <Alert type="warning" showIcon message={t('payment.noMethodAvailable')} />
        ) : null}
        {showSectionTitles && (
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">{t('payment.methodInformation')}</p>
        )}
        <div
          data-testid="pos-payment-method-grid"
          className={drafts.length > 1
            ? isDialog
              ? drafts.length === 2
                ? 'grid gap-2 min-[768px]:grid-cols-2'
                : 'grid gap-2 min-[768px]:grid-cols-2 min-[1024px]:grid-cols-3'
              : 'space-y-3 min-[1024px]:grid min-[1024px]:grid-cols-2 min-[1024px]:gap-3 min-[1024px]:space-y-0 lg:block lg:space-y-3'
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
                className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm min-[768px]:p-2.5"
              >
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="text-xs font-black uppercase tracking-wide text-slate-500">
                {isDialog ? t('payment.line', { number: index + 1 }) : `${t('payment.methodInformation')} ${index + 1}`}
              </span>
              {drafts.length > 1 && (
                <button
                  type="button"
                  data-testid={`pos-payment-remove-${index}`}
                  onClick={() => onRemove(draft.clientId)}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-red-200 bg-red-50 text-red-600 transition-colors hover:border-red-300 hover:bg-red-100"
                  aria-label={t('payment.remove')}
                  title={t('payment.remove')}
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
            {isDialog ? (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {validPaymentMethods.map((item, methodIndex) => {
                  const paymentMethod = item.method;
                  const Icon = getMethodIcon(paymentMethod.category);
                  const active = paymentMethod.id === draft.paymentMethodId;
                  const usedByAnotherPayment = selectedIds.has(paymentMethod.id) && !active;
                  const isLastDraft = index === drafts.length - 1;
                  return (
                    <button
                      key={paymentMethod.id}
                      type="button"
                      data-testid={`pos-payment-method-${index}-${paymentMethod.id}`}
                      aria-pressed={active}
                      disabled={usedByAnotherPayment}
                      onClick={() => onUpdate(draft.clientId, {
                        paymentMethodId: paymentMethod.id,
                        reference: paymentMethod.requires_reference ? draft.reference : '',
                      })}
                      className={`flex min-h-10 items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left transition disabled:cursor-not-allowed disabled:opacity-35 ${active ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-100' : 'border-slate-200 hover:border-blue-300'}`}
                    >
                      <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-md ${active ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                        <Icon size={14} />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-xs font-black text-slate-900">{paymentMethod.name}</span>
                      {isLastDraft && methodIndex < 9 && (
                        <kbd className="ml-auto hidden shrink-0 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[10px] font-semibold leading-none text-slate-500 sm:inline-block">
                          {methodIndex + 1}
                        </kbd>
                      )}
                    </button>
                  );
                })}
              </div>
            ) : (
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
              </div>
            )}
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
            {isDialog ? (
              <div className="mt-3 space-y-1.5">
                <label className="block text-sm font-bold text-slate-700">{t('payment.amountPlaceholder')}</label>
                <InputNumber<number>
                  data-testid={`pos-payment-amount-${index}`}
                  min={0}
                  value={draft.amount === '' ? null : Number(draft.amount)}
                  prefix="Rp"
                  status={line?.error?.startsWith('Nominal pembayaran ') ? 'error' : undefined}
                  className="w-full"
                  formatter={(value) => formatCurrency(Number(value ?? 0))}
                  parser={(value) => Number(String(value ?? '').replace(/\D/g, ''))}
                  onChange={(value) => onUpdate(draft.clientId, {
                    amount: value === null ? '' : String(value),
                    isAmountAutoFilled: false,
                  })}
                />
              </div>
            ) : (
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
            )}
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

        {canAdd && (
          <button
            type="button"
            data-testid="pos-add-payment"
            onClick={onAdd}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-blue-200 py-2 font-semibold text-blue-700 transition hover:border-blue-300 hover:bg-blue-50"
          >
            <Plus size={17} /> {t('payment.add')}
            {isDialog && (
              <kbd className="rounded border border-blue-200 bg-white px-1.5 py-0.5 font-mono text-[10px] font-semibold leading-none text-blue-700">F9</kbd>
            )}
          </button>
        )}

        {showSectionTitles && (
          <p className="pt-1 text-xs font-bold uppercase tracking-wide text-slate-400">{t('payment.billingInformation')}</p>
        )}
        <PosPaymentSummary
          total={total}
          discountAmount={discountAmount}
          totalPaid={preview.totalTendered}
          remainingAmount={preview.remainingAmount}
          changeAmount={preview.totalChange}
        />
      </div>

      <div
        data-testid="pos-payment-actions"
        className={`${isDialog
          ? 'sticky bottom-0 z-30 mt-auto grid shrink-0 gap-2 border-t border-slate-200 bg-white pb-4 pt-3 shadow-[0_-8px_18px_-14px_rgba(15,23,42,0.25)]'
          : 'sticky bottom-0 z-30 -mx-3 mt-auto grid shrink-0 gap-2 border-t border-gray-200 bg-white px-3 pb-3 pt-3 shadow-[0_-8px_18px_-14px_rgba(15,23,42,0.45)] min-[1024px]:static lg:sticky'} ${useSplitAction || !onRecordExpense
          ? 'grid-cols-[1fr_2fr]'
          : 'grid-cols-[auto_minmax(5rem,1fr)_minmax(0,2fr)]'}`}
      >
        {!useSplitAction && onRecordExpense ? (
          <button
            type="button"
            data-testid="pos-record-expense"
            disabled={isRecordingExpense}
            onClick={() => void handleRecordExpense()}
            className="flex items-center justify-center gap-1.5 rounded-lg px-2 py-2.5 text-sm font-semibold text-amber-700 transition hover:bg-amber-50 disabled:cursor-wait disabled:opacity-60"
            title={t('payment.recordExpense')}
            aria-label={t('payment.recordExpense')}
          >
            <NotebookPen size={16} className="shrink-0" />
            <span className="hidden whitespace-nowrap sm:inline">
              {isRecordingExpense ? t('payment.recordingExpense') : t('payment.recordExpense')}
            </span>
            <span className="whitespace-nowrap sm:hidden">{t('payment.expense')}</span>
          </button>
        ) : null}
        <button type="button" onClick={onCancel} className="flex items-center justify-center gap-1.5 rounded-lg border border-gray-300 bg-white py-2.5 font-semibold text-gray-700 hover:bg-gray-50"><X size={16} /> {t('payment.cancel')}</button>
        <div className="flex min-w-0">
          <button
            type="button"
            data-testid="pos-confirm-payment"
            disabled={!canConfirm}
            onClick={() => void onConfirm()}
            className={`flex min-w-0 flex-1 items-center justify-center gap-1.5 py-2.5 font-bold text-white shadow-sm ${useSplitAction ? 'rounded-l-lg' : 'rounded-lg'} bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:shadow-none`}
          >
            <CheckCircle2 size={16} className="shrink-0" />
            <span className="truncate">{confirmLabel ?? t('payment.confirmPayment')}</span>
            {isDialog && (
              <kbd className="hidden shrink-0 rounded border border-white/30 bg-white/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold leading-none text-white/90 sm:inline-block">Ctrl+Enter</kbd>
            )}
          </button>
          {useSplitAction ? (
            <Dropdown
              trigger={['click']}
              placement="topRight"
              overlayStyle={{ zIndex: 1200 }}
              menu={{
                items: [
                  {
                    key: 'confirm-payment',
                    icon: <CheckCircle2 size={15} />,
                    label: confirmLabel ?? t('payment.confirmPayment'),
                    disabled: !canConfirm,
                  },
                  { type: 'divider' },
                  {
                    key: 'record-expense',
                    icon: <NotebookPen size={15} className="text-amber-600" />,
                    label: isRecordingExpense ? t('payment.recordingExpense') : t('payment.recordExpense'),
                    disabled: isRecordingExpense,
                  },
                ],
                onClick: ({ key }) => {
                  if (key === 'confirm-payment' && canConfirm) void onConfirm();
                  if (key === 'record-expense') void handleRecordExpense();
                },
              }}
            >
              <button
                type="button"
                className="grid w-11 shrink-0 place-items-center rounded-r-lg border-l border-blue-500 bg-blue-600 text-white shadow-sm transition hover:bg-blue-700"
                title={t('payment.moreActions')}
                aria-label={t('payment.moreActions')}
              >
                <ChevronDown size={17} />
              </button>
            </Dropdown>
          ) : null}
        </div>
      </div>
    </div>
  );
}
