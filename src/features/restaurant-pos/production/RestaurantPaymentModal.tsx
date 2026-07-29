import { Button, Input, InputNumber, Modal, Segmented } from 'antd';
import { Banknote, CreditCard, QrCode, ReceiptText, Split } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useI18n } from '@/hooks/useI18n';
import type { PosPaymentMethodOption } from '@/hooks/usePosPaymentMethods';
import { isRestaurantPaymentModeEnabled } from '@/services/restaurantPosService';
import type { PaymentMethodCategory, RestaurantOrderRecord } from '@/types';
import { formatCurrency } from '@/utils/formatters';

interface RestaurantPaymentModalProps {
  open: boolean;
  order?: RestaurantOrderRecord;
  total: number;
  methods: PosPaymentMethodOption[];
  loading?: boolean;
  onCancel: () => void;
  onConfirm: (input: {
    paymentMethodId: string;
    tenderedAmount: number;
    paymentReference?: string;
  }) => void;
}

const getMethodIcon = (category: PaymentMethodCategory) => {
  if (category === 'CASH') return Banknote;
  if (category === 'QRIS') return QrCode;
  return CreditCard;
};

export function RestaurantPaymentModal({
  open,
  order,
  total,
  methods,
  loading,
  onCancel,
  onConfirm,
}: RestaurantPaymentModalProps) {
  const { t } = useI18n();
  const validMethods = useMemo(() => methods.filter((option) => option.isValid), [methods]);
  const [methodId, setMethodId] = useState('');
  const [cashReceived, setCashReceived] = useState<number | null>(null);
  const [reference, setReference] = useState('');
  const defaultMethod = validMethods.find((option) => option.method.code.toUpperCase() === 'TUNAI')
    ?? validMethods[0];
  const effectiveMethodId = validMethods.some((option) => option.method.id === methodId)
    ? methodId
    : defaultMethod?.method.id ?? '';
  const selected = validMethods.find((option) => option.method.id === effectiveMethodId)?.method;
  const isCash = selected?.category === 'CASH';
  const tenderedAmount = isCash ? Number(cashReceived ?? total) : total;
  const change = isCash ? Math.max(0, tenderedAmount - total) : 0;
  const isValid = Boolean(
    selected
    && total > 0
    && tenderedAmount >= total
    && (!selected.requires_reference || reference.trim()),
  );

  return (
    <Modal
      open={open}
      onCancel={loading ? undefined : onCancel}
      footer={null}
      centered
      width={620}
      destroyOnHidden
      title={t('restaurantPos.paymentTitle')}
      maskClosable={!loading}
      closable={!loading}
    >
      <div className="space-y-4 pt-2">
        <div className="rounded-2xl bg-gradient-to-br from-blue-700 to-slate-900 p-4 text-white">
          <p className="text-xs font-semibold text-blue-100">{order?.customer_name || order?.order_number} · {order?.order_type === 'DELIVERY' ? 'Delivery' : order?.order_type === 'TAKEAWAY' ? 'Takeaway' : 'Dine In'}</p>
          <p className="mt-1 text-xs text-blue-100">{order?.order_number} · {order?.table_name ?? t('restaurantPos.counterDestination')}</p>
          <div className="mt-3 flex items-end justify-between gap-3"><span className="text-sm text-blue-100">{t('restaurantPos.total')}</span><span className="text-3xl font-black">Rp {formatCurrency(total)}</span></div>
        </div>

        <Segmented
          block
          value="FULL"
          options={[
            { label: t('restaurantPos.fullPayment'), value: 'FULL', icon: <ReceiptText size={14} />, disabled: !isRestaurantPaymentModeEnabled('FULL') },
            { label: `${t('restaurantPos.splitBill')} · ${t('restaurantPos.comingSoon')}`, value: 'SPLIT', icon: <Split size={14} />, disabled: !isRestaurantPaymentModeEnabled('SPLIT') },
          ]}
        />

        {validMethods.length === 0 ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-700">{t('restaurantPos.noPaymentMethods')}</div>
        ) : (
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">{t('restaurantPos.paymentMethod')}</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {validMethods.map((option) => {
                const method = option.method;
                const Icon = getMethodIcon(method.category);
                const active = method.id === effectiveMethodId;
                return (
                  <button
                    key={method.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => {
                      setMethodId(method.id);
                      setCashReceived(null);
                      setReference('');
                    }}
                    className={`rounded-xl border p-3 text-left transition ${active ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-100' : 'border-slate-200 hover:border-blue-300'}`}
                  >
                    <span className={`grid h-8 w-8 place-items-center rounded-lg ${active ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}><Icon size={16} /></span>
                    <p className="mt-2 text-sm font-black text-slate-900">{method.name}</p>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {selected?.requires_reference ? (
          <label className="block">
            <span className="mb-1.5 block text-xs font-bold text-slate-600">{t('restaurantPos.paymentReference')}</span>
            <Input value={reference} maxLength={100} onChange={(event) => setReference(event.target.value)} />
          </label>
        ) : null}

        {isCash ? (
          <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-3">
            <div className="flex items-center justify-between gap-4">
              <label className="text-sm font-bold text-slate-700">{t('restaurantPos.cashReceived')}</label>
              <InputNumber<number>
                min={total}
                value={cashReceived ?? total}
                prefix="Rp"
                className="w-48"
                formatter={(value) => formatCurrency(Number(value ?? 0))}
                parser={(value) => Number(String(value ?? '').replace(/\D/g, ''))}
                onChange={(value) => setCashReceived(Number(value ?? total))}
              />
            </div>
            <div className="mt-3 flex justify-between border-t border-blue-100 pt-3 text-sm"><span className="text-slate-500">{t('restaurantPos.change')}</span><span className="font-black text-emerald-600">Rp {formatCurrency(change)}</span></div>
          </div>
        ) : null}

        <div className="grid grid-cols-[1fr_2fr] gap-2">
          <Button size="large" disabled={loading} onClick={onCancel}>{t('common.cancel')}</Button>
          <Button
            type="primary"
            size="large"
            disabled={!isValid}
            loading={loading}
            onClick={() => {
              if (!selected || !isValid) return;
              onConfirm({
                paymentMethodId: selected.id,
                tenderedAmount,
                paymentReference: reference.trim() || undefined,
              });
            }}
            className="!bg-blue-600 !font-bold hover:!bg-blue-700"
          >
            {t('restaurantPos.confirmPayment')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
