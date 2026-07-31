import { Button } from 'antd';
import { CheckCheck, ChefHat, Clock3, Flame, Package, TimerReset } from 'lucide-react';
import { useI18n } from '@/hooks/useI18n';
import type { RestaurantKitchenTicketRecord, RestaurantKitchenTicketStatus } from '@/types';

interface RestaurantKitchenBoardProps {
  tickets: RestaurantKitchenTicketRecord[];
  onAdvance: (ticketId: string) => void;
}

const ACTIVE_COLUMNS: Array<{
  status: Exclude<RestaurantKitchenTicketStatus, 'COMPLETED'>;
  labelKey: 'restaurantPos.newOrders' | 'restaurantPos.preparing' | 'restaurantPos.ready';
  accent: string;
}> = [
  { status: 'NEW', labelKey: 'restaurantPos.newOrders', accent: 'bg-rose-500' },
  { status: 'PREPARING', labelKey: 'restaurantPos.preparing', accent: 'bg-amber-500' },
  { status: 'READY', labelKey: 'restaurantPos.ready', accent: 'bg-emerald-500' },
];

export function RestaurantKitchenBoard({ tickets, onAdvance }: RestaurantKitchenBoardProps) {
  const { t } = useI18n();
  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-blue-100 bg-slate-100/70 shadow-sm">
      <div className="flex shrink-0 items-center gap-3 border-b border-blue-100 bg-white p-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-600 text-white"><ChefHat size={21} /></span>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Kitchen display</p>
          <h2 className="text-lg font-black text-slate-900">{t('restaurantPos.kitchen')}</h2>
        </div>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto p-3 lg:grid-cols-3 lg:overflow-hidden">
        {ACTIVE_COLUMNS.map((column) => {
          const columnTickets = tickets.filter((ticket) => ticket.status === column.status);
          return (
            <div key={column.status} className="flex min-h-64 flex-col overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
              <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-3 py-2.5">
                <div className="flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${column.accent}`} /><h3 className="text-sm font-black text-slate-800">{t(column.labelKey)}</h3></div>
                <span className="grid h-7 min-w-7 place-items-center rounded-lg bg-white px-2 text-xs font-black shadow-sm">{columnTickets.length}</span>
              </div>
              <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto p-2.5">
                {columnTickets.map((ticket) => (
                  <article key={ticket.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                    <div className="flex items-start justify-between gap-2 border-b border-dashed border-slate-200 p-3">
                      <div><p className="font-black text-slate-950">{ticket.order_number}</p><p className="mt-0.5 text-xs font-semibold text-slate-700">{ticket.customer_name || ticket.order_number} · {ticket.order_type === 'DELIVERY' ? 'Delivery' : ticket.order_type === 'TAKEAWAY' ? 'Takeaway' : 'Dine In'}</p><p className="mt-0.5 text-xs font-semibold text-slate-500">{ticket.table_name || ticket.destination_label}</p></div>
                      <span className="flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-500">
                        <Clock3 size={11} /> {new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit' }).format(new Date(ticket.created_at))}
                      </span>
                    </div>
                    <div className="space-y-2 p-3">
                      {ticket.lines.map((line) => (
                        <div key={`${ticket.id}-${line.order_line_id}`} className="flex gap-2 text-sm">
                          <span className="grid h-6 min-w-6 place-items-center rounded-md bg-blue-600 px-1 text-xs font-black text-white">{line.quantity}×</span>
                          <div>
                            <div className="flex flex-wrap items-center gap-1.5">
                              <p className="font-bold text-slate-800">{line.name}</p>
                              {line.fulfillment_type === 'TAKEAWAY' ? (
                                <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-amber-800">
                                  <Package size={10} /> Takeaway
                                </span>
                              ) : null}
                            </div>
                            {line.note ? <p className="text-[11px] font-semibold text-rose-500">↳ {line.note}</p> : null}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="border-t border-slate-100 p-2.5">
                      <Button
                        block
                        type={ticket.status === 'NEW' || ticket.status === 'READY' ? 'primary' : 'default'}
                        onClick={() => onAdvance(ticket.id)}
                        className={ticket.status === 'READY' ? '!bg-emerald-600 !font-bold hover:!bg-emerald-700' : '!font-bold'}
                      >
                        {ticket.status === 'NEW' ? <Flame size={14} /> : ticket.status === 'PREPARING' ? <TimerReset size={14} /> : <CheckCheck size={14} />}
                        {ticket.status === 'NEW' ? t('restaurantPos.startPreparing') : ticket.status === 'PREPARING' ? t('restaurantPos.markReady') : t('restaurantPos.markComplete')}
                      </Button>
                    </div>
                  </article>
                ))}
                {columnTickets.length === 0 ? (
                  <div className="grid min-h-36 place-items-center rounded-xl border border-dashed border-slate-200 text-xs font-semibold text-slate-400">{t('restaurantPos.noTickets')}</div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
