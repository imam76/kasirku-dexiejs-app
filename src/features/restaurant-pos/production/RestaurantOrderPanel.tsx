import { Button, Checkbox, Input, InputNumber, Segmented } from 'antd';
import { ChefHat, Clock3, CupSoda, Minus, Plus, ReceiptText, ShoppingBag, Utensils } from 'lucide-react';
import { useI18n } from '@/hooks/useI18n';
import type { PromoEvaluationResult } from '@/services/promoService';
import { getPendingKitchenQuantity, getRestaurantOrderLineFulfillmentType, getRestaurantProductKind } from '@/services/restaurantPosService';
import type { RestaurantOrderLineFulfillmentType, RestaurantOrderRecord, RestaurantOrderType, RestaurantServiceMode } from '@/types';
import { formatCurrency } from '@/utils/formatters';
import { formatRestaurantOrderStartTime } from './restaurantOrderTime';

interface RestaurantOrderPanelProps {
  mode: RestaurantServiceMode;
  order?: RestaurantOrderRecord;
  promo: PromoEvaluationResult;
  isSending?: boolean;
  isPaying?: boolean;
  isUpdatingInfo?: boolean;
  isOrderInfoComplete: boolean;
  customerName: string;
  guestCount: number | null;
  orderType: RestaurantOrderType;
  onCustomerNameChange: (value: string) => void;
  onCustomerNameBlur: () => void;
  onGuestCountChange: (value: number | null) => void;
  onGuestCountBlur: () => void;
  onOrderTypeChange: (value: RestaurantOrderType) => void;
  onQuantityChange: (lineId: string, quantity: number) => void;
  onNoteChange: (lineId: string, note: string) => void;
  onFulfillmentTypeChange: (lineId: string, fulfillmentType: RestaurantOrderLineFulfillmentType) => void;
  onSendKitchen: () => void;
  onPay: () => void;
  onCancel: () => void;
}

export function RestaurantOrderPanel({
  mode,
  order,
  promo,
  isSending,
  isPaying,
  isUpdatingInfo,
  isOrderInfoComplete,
  customerName,
  guestCount,
  orderType,
  onCustomerNameChange,
  onCustomerNameBlur,
  onGuestCountChange,
  onGuestCountBlur,
  onOrderTypeChange,
  onQuantityChange,
  onNoteChange,
  onFulfillmentTypeChange,
  onSendKitchen,
  onPay,
  onCancel,
}: RestaurantOrderPanelProps) {
  const { t } = useI18n();
  const lines = order?.lines ?? [];
  const itemCount = lines.reduce((sum, line) => sum + line.quantity, 0);
  const pendingCount = lines.reduce((sum, line) => sum + getPendingKitchenQuantity(line), 0);
  const hasLines = lines.length > 0;
  const hasSentItems = lines.some((line) => line.sent_quantity > 0);
  const orderStartTime = formatRestaurantOrderStartTime(order?.opened_at);

  return (
    <aside className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-sm">
      <div className="shrink-0 border-b border-blue-50 p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">{t('restaurantPos.activeOrder')}</p>
            <h2 className="mt-1 truncate text-xl font-black text-slate-900">
              {order?.table_name ?? t('restaurantPos.counterDestination')}
            </h2>
            {order ? (
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-bold text-blue-600">
                <span>{t('restaurantPos.orderNumber', { number: order.order_number })}</span>
                {orderStartTime ? (
                  <span className="flex items-center gap-1 text-slate-500">
                    <Clock3 size={12} /> {orderStartTime}
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-600"><ReceiptText size={19} /></span>
        </div>
        <div className="mt-3 space-y-2.5">
          {mode === 'COUNTER_SERVICE' ? (
            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-400">Tipe pesanan</label>
              <Segmented
                block
                size="small"
                value={orderType}
                disabled={isUpdatingInfo}
                onChange={(value) => onOrderTypeChange(value as RestaurantOrderType)}
                options={[
                  { value: 'TAKEAWAY', label: 'Takeaway' },
                  { value: 'DELIVERY', label: 'Delivery' },
                ]}
              />
            </div>
          ) : null}
          <div className="flex gap-2">
            <div className={mode === 'TABLE_SERVICE' ? 'min-w-0 flex-[0_0_calc(70%-0.25rem)]' : 'min-w-0 flex-1'}>
              <label htmlFor="restaurant-customer-name" className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-400">Nama pelanggan</label>
              <Input
                id="restaurant-customer-name"
                value={customerName}
                maxLength={100}
                disabled={!order || isUpdatingInfo}
                placeholder={order ? 'Masukkan nama pelanggan' : 'Pilih item untuk mulai pesanan'}
                status={order && !customerName.trim() ? 'error' : undefined}
                onChange={(event) => onCustomerNameChange(event.target.value)}
                onBlur={onCustomerNameBlur}
              />
            </div>
            {mode === 'TABLE_SERVICE' ? (
              <div className="min-w-0 flex-[0_0_calc(30%-0.25rem)]">
                <label htmlFor="restaurant-guest-count" className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-400">Jumlah tamu</label>
                <InputNumber<number>
                  id="restaurant-guest-count"
                  className="w-full"
                  min={1}
                  precision={0}
                  value={guestCount}
                  disabled={!order || isUpdatingInfo}
                  onChange={onGuestCountChange}
                  onBlur={onGuestCountBlur}
                />
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {!hasLines ? (
          <div className="grid h-full min-h-52 place-items-center text-center">
            <div className="max-w-56">
              <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-blue-50 text-blue-300"><ShoppingBag size={24} /></span>
              <p className="mt-3 font-bold text-slate-700">{t('restaurantPos.emptyOrder')}</p>
              <p className="mt-1 text-xs leading-5 text-slate-400">{t('restaurantPos.emptyOrderHint')}</p>
            </div>
          </div>
        ) : (
          <div className="space-y-2.5">
            {lines.map((line) => {
              const Icon = getRestaurantProductKind({ category: line.product_category }) === 'DRINK' ? CupSoda : Utensils;
              const fulfillmentType = getRestaurantOrderLineFulfillmentType(line, order?.order_type ?? orderType);
              return (
                <article key={line.id} className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
                  <div className="flex gap-2.5">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white text-blue-600 shadow-sm"><Icon size={17} /></span>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-bold text-slate-800">{line.product_name}</h3>
                      <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                        <span className="text-[11px] font-semibold text-slate-400">Rp {formatCurrency(line.price)} / {line.unit}</span>
                        {line.sent_quantity > 0 ? (
                          <span className="flex items-center gap-1 rounded-full bg-blue-50 px-2 py-1 text-[9px] font-bold text-blue-600">
                            <ChefHat size={10} /> {t('restaurantPos.sent', { count: line.sent_quantity })}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                  <div className="mt-2.5 flex items-center gap-2">
                    <Input
                      size="small"
                      defaultValue={line.note}
                      placeholder={t('restaurantPos.itemNote')}
                      onBlur={(event) => onNoteChange(line.id, event.target.value)}
                      className="min-w-0 flex-1"
                    />
                    <div className="flex shrink-0 items-center overflow-hidden rounded-lg border border-blue-100 bg-white">
                      <button
                        type="button"
                        disabled={line.quantity <= line.sent_quantity}
                        onClick={() => onQuantityChange(line.id, line.quantity - 1)}
                        className="grid h-8 w-8 place-items-center text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-30"
                      >
                        <Minus size={13} />
                      </button>
                      <span className="w-8 text-center text-xs font-black text-slate-900">{line.quantity}</span>
                      <button
                        type="button"
                        onClick={() => onQuantityChange(line.id, line.quantity + 1)}
                        className="grid h-8 w-8 place-items-center text-blue-700 hover:bg-blue-50"
                      >
                        <Plus size={13} />
                      </button>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <Checkbox
                      checked={fulfillmentType === 'TAKEAWAY'}
                      disabled={mode !== 'TABLE_SERVICE' || line.sent_quantity > 0}
                      onChange={(event) => onFulfillmentTypeChange(
                        line.id,
                        event.target.checked ? 'TAKEAWAY' : 'DINE_IN',
                      )}
                      className="!text-xs !font-semibold !text-amber-700"
                    >
                      Takeaway
                    </Checkbox>
                    <p className="text-right text-xs font-black text-slate-700">Rp {formatCurrency(line.price * line.quantity)}</p>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-blue-50 bg-white p-3">
        <div className="space-y-1.5 text-xs">
          <div className="flex justify-between text-slate-500"><span>{t('restaurantPos.subtotal')}</span><span>Rp {formatCurrency(promo.subtotal_before_discount)}</span></div>
          {promo.discount_amount > 0 ? <div className="flex justify-between text-rose-600"><span>{t('restaurantPos.discount')}</span><span>-Rp {formatCurrency(promo.discount_amount)}</span></div> : null}
          <div className="flex items-end justify-between border-t border-blue-50 pt-2">
            <div><p className="font-bold text-slate-800">{t('restaurantPos.total')}</p><p className="text-[10px] text-slate-400">{t('restaurantPos.itemCount', { count: itemCount })}</p></div>
            <span className="text-xl font-black text-slate-950">Rp {formatCurrency(promo.total_amount)}</span>
          </div>
        </div>
        {order ? (
          <Button danger type="text" block disabled={isPaying || isSending || hasSentItems} onClick={onCancel} className="mt-2 !text-xs !font-semibold">
            {t('restaurantPos.cancelOrder')}
          </Button>
        ) : null}
        {mode === 'TABLE_SERVICE' ? (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button
              size="large"
              disabled={!hasLines || pendingCount === 0 || !isOrderInfoComplete}
              loading={isSending}
              onClick={onSendKitchen}
              className="!font-bold"
            >
              <ChefHat size={15} /> {pendingCount > 0 ? t('restaurantPos.sendKitchenCount', { count: pendingCount }) : t('restaurantPos.sendKitchen')}
            </Button>
            <Button
              type="primary"
              size="large"
              disabled={!hasLines || !isOrderInfoComplete}
              loading={isPaying}
              onClick={onPay}
              title={`${t('restaurantPos.pay')} · F2`}
              className="!bg-blue-600 !font-bold hover:!bg-blue-700"
            >
              {t('restaurantPos.pay')}
            </Button>
          </div>
        ) : (
          <Button
            type="primary"
            size="large"
            block
            disabled={!hasLines || !isOrderInfoComplete}
            loading={isPaying}
            onClick={onPay}
            title={`${t('restaurantPos.payAndSend')} · F2`}
            className="mt-3 !bg-blue-600 !font-bold hover:!bg-blue-700"
          >
            {t('restaurantPos.payAndSend')}
          </Button>
        )}
      </div>
    </aside>
  );
}
