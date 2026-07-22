import { Button, Input, InputNumber, Segmented } from 'antd';
import { ChefHat, ChevronRight, Minus, Plus, ReceiptText, Send, ShoppingBag, Users } from 'lucide-react';
import { formatCurrency } from '@/utils/formatters';
import type { RestaurantOrder, RestaurantOrderType, RestaurantServiceMode, RestaurantTable } from '../types';

interface RestaurantOrderPanelProps {
  mode: RestaurantServiceMode;
  table?: RestaurantTable;
  order?: RestaurantOrder;
  total: number;
  pendingLineCount: number;
  onOrderTypeChange: (type: RestaurantOrderType) => void;
  onGuestCountChange: (count: number) => void;
  onQuantityChange: (lineId: string, quantity: number) => void;
  onNoteChange: (lineId: string, note: string) => void;
  onSendKitchen: () => void;
  onOpenPayment: () => void;
}

const ORDER_TYPE_OPTIONS = [
  { label: 'Dine-in', value: 'DINE_IN' },
  { label: 'Takeaway', value: 'TAKEAWAY' },
  { label: 'Delivery', value: 'DELIVERY' },
];

export function RestaurantOrderPanel({
  mode,
  table,
  order,
  total,
  pendingLineCount,
  onOrderTypeChange,
  onGuestCountChange,
  onQuantityChange,
  onNoteChange,
  onSendKitchen,
  onOpenPayment,
}: RestaurantOrderPanelProps) {
  const hasLines = Boolean(order?.lines.length);
  const allSent = hasLines && pendingLineCount === 0;

  return (
    <aside className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="border-b border-slate-100 p-4 dark:border-slate-800">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Pesanan aktif</p>
            <div className="mt-1 flex items-center gap-2">
              <h2 className="text-xl font-black text-slate-900 dark:text-white">
                {mode === 'TABLE_SERVICE' ? table?.name ?? 'Pilih meja' : order?.orderNumber ?? 'Counter'}
              </h2>
              {order ? <span className="rounded-md bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-500 dark:bg-slate-800 dark:text-slate-300">{order.orderNumber}</span> : null}
            </div>
          </div>
          <div className="rounded-xl bg-blue-50 p-2 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300"><ReceiptText size={20} /></div>
        </div>

        <Segmented
          block
          size="small"
          className="mt-4"
          value={order?.orderType ?? 'DINE_IN'}
          options={ORDER_TYPE_OPTIONS}
          onChange={(value) => onOrderTypeChange(value as RestaurantOrderType)}
        />

        {mode === 'TABLE_SERVICE' ? (
          <div className="mt-3 flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 dark:bg-slate-800">
            <span className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300"><Users size={15} /> Jumlah tamu</span>
            <InputNumber
              size="small"
              min={1}
              max={table?.capacity ?? 20}
              value={order?.guestCount ?? 2}
              onChange={(value) => onGuestCountChange(Number(value ?? 1))}
              className="w-20"
            />
          </div>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {!hasLines ? (
          <div className="grid h-full min-h-64 place-items-center text-center">
            <div className="max-w-52">
              <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-slate-800"><ShoppingBag size={28} /></div>
              <p className="mt-4 font-bold text-slate-800 dark:text-slate-100">Pesanan masih kosong</p>
              <p className="mt-1 text-xs leading-5 text-slate-400">Pilih menu untuk memulai simulasi pesanan restoran.</p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {order?.lines.map((line) => {
              const sent = line.sentQuantity > 0;
              return (
                <article key={line.id} className="rounded-2xl border border-slate-100 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-800/60">
                  <div className="flex gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-xl shadow-sm dark:bg-slate-900">{line.menuItem.emoji}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h3 className="text-sm font-bold leading-5 text-slate-800 dark:text-slate-100">{line.menuItem.name}</h3>
                          <p className="mt-0.5 text-[11px] font-semibold text-slate-400">Rp {formatCurrency(line.menuItem.price)}</p>
                        </div>
                        {sent ? <span className="flex shrink-0 items-center gap-1 rounded-full bg-blue-50 px-2 py-1 text-[9px] font-bold text-blue-600 dark:bg-blue-950/50 dark:text-blue-300"><ChefHat size={10} /> {line.sentQuantity} terkirim</span> : null}
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-2">
                    <Input
                      size="small"
                      value={line.note}
                      onChange={(event) => onNoteChange(line.id, event.target.value)}
                      placeholder="Catatan: tanpa es, pedas..."
                      className="min-w-0 flex-1"
                    />
                    <div className="flex shrink-0 items-center rounded-lg border border-slate-200 bg-white p-0.5 dark:border-slate-700 dark:bg-slate-900">
                      <button type="button" disabled={line.quantity <= line.sentQuantity} onClick={() => onQuantityChange(line.id, line.quantity - 1)} className="grid h-7 w-7 place-items-center rounded-md text-slate-500 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30 dark:hover:bg-slate-800"><Minus size={13} /></button>
                      <span className="w-7 text-center text-xs font-black text-slate-800 dark:text-white">{line.quantity}</span>
                      <button type="button" onClick={() => onQuantityChange(line.id, line.quantity + 1)} className="grid h-7 w-7 place-items-center rounded-md text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><Plus size={13} /></button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      <div className="border-t border-slate-100 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-3 space-y-1.5 text-xs">
          <div className="flex justify-between text-slate-500"><span>Subtotal</span><span>Rp {formatCurrency(total)}</span></div>
          <div className="flex justify-between text-slate-500"><span>Pajak & layanan</span><span>Termasuk harga</span></div>
          <div className="flex items-end justify-between pt-1"><span className="font-bold text-slate-800 dark:text-slate-100">Total</span><span className="text-2xl font-black text-slate-950 dark:text-white">Rp {formatCurrency(total)}</span></div>
        </div>

        {mode === 'COUNTER_SERVICE' ? (
          <Button type="primary" size="large" block disabled={!hasLines} onClick={onOpenPayment} className="!h-12 !bg-orange-500 !font-bold hover:!bg-orange-600">
            Bayar & kirim ke dapur <ChevronRight size={17} />
          </Button>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <Button size="large" disabled={!hasLines || pendingLineCount === 0} onClick={onSendKitchen} className="!h-12 !font-bold">
              <Send size={16} /> {pendingLineCount > 0 ? `Kirim ${pendingLineCount}` : 'Terkirim'}
            </Button>
            <Button type="primary" size="large" disabled={!hasLines} onClick={onOpenPayment} className="!h-12 !bg-slate-900 !font-bold hover:!bg-orange-600 dark:!bg-orange-500">
              {allSent ? 'Bayar' : 'Buka bill'} <ChevronRight size={16} />
            </Button>
          </div>
        )}
        <p className="mt-2 text-center text-[10px] leading-4 text-slate-400">Simulasi lokal · tidak mencatat transaksi atau mengubah stok</p>
      </div>
    </aside>
  );
}
