import { Button, Segmented } from 'antd';
import { CheckCheck, ChefHat, Clock3, Coffee, CookingPot, Dessert, Flame, TimerReset } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { KitchenStation, KitchenTicket, KitchenTicketStatus } from '../types';

const COLUMNS: Array<{ status: KitchenTicketStatus; label: string; caption: string; accent: string }> = [
  { status: 'NEW', label: 'Pesanan baru', caption: 'Perlu dikonfirmasi', accent: 'bg-rose-500' },
  { status: 'PREPARING', label: 'Sedang dibuat', caption: 'Dalam proses', accent: 'bg-amber-500' },
  { status: 'READY', label: 'Siap diantar', caption: 'Menunggu runner', accent: 'bg-emerald-500' },
];

const STATION_META: Record<KitchenStation, { label: string; icon: typeof CookingPot; className: string }> = {
  KITCHEN: { label: 'Dapur', icon: CookingPot, className: 'bg-orange-50 text-orange-700 dark:bg-orange-950/50 dark:text-orange-300' },
  BAR: { label: 'Bar', icon: Coffee, className: 'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300' },
  DESSERT: { label: 'Dessert', icon: Dessert, className: 'bg-pink-50 text-pink-700 dark:bg-pink-950/50 dark:text-pink-300' },
};

interface KitchenDisplayBoardProps {
  tickets: KitchenTicket[];
  onAdvance: (ticketId: string) => void;
  onComplete: (ticketId: string) => void;
}

export function KitchenDisplayBoard({ tickets, onAdvance, onComplete }: KitchenDisplayBoardProps) {
  const [station, setStation] = useState<'ALL' | KitchenStation>('ALL');
  const filteredTickets = useMemo(() => tickets.filter((ticket) => station === 'ALL' || ticket.station === station), [station, tickets]);

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-100/70 shadow-sm dark:border-slate-700 dark:bg-slate-950/60">
      <div className="flex flex-col gap-4 border-b border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-orange-500 text-white shadow-lg shadow-orange-200 dark:shadow-none"><ChefHat size={23} /></div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Kitchen display system</p>
            <h2 className="mt-0.5 text-lg font-black text-slate-900 dark:text-white">Antrean produksi</h2>
          </div>
        </div>
        <Segmented
          value={station}
          onChange={(value) => setStation(value as 'ALL' | KitchenStation)}
          options={[
            { label: 'Semua', value: 'ALL' },
            { label: 'Dapur', value: 'KITCHEN' },
            { label: 'Bar', value: 'BAR' },
            { label: 'Dessert', value: 'DESSERT' },
          ]}
        />
      </div>

      <div className="grid min-h-[560px] grid-cols-1 gap-3 p-3 lg:grid-cols-3">
        {COLUMNS.map((column) => {
          const columnTickets = filteredTickets.filter((ticket) => ticket.status === column.status);
          return (
            <div key={column.status} className="flex min-h-64 flex-col rounded-2xl border border-slate-200 bg-slate-50/80 dark:border-slate-800 dark:bg-slate-900/80">
              <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
                <div className="flex items-center gap-2.5">
                  <span className={`h-2.5 w-2.5 rounded-full ${column.accent}`} />
                  <div><h3 className="text-sm font-black text-slate-800 dark:text-slate-100">{column.label}</h3><p className="text-[10px] text-slate-400">{column.caption}</p></div>
                </div>
                <span className="grid h-7 min-w-7 place-items-center rounded-lg bg-white px-2 text-xs font-black text-slate-700 shadow-sm dark:bg-slate-800 dark:text-slate-200">{columnTickets.length}</span>
              </div>

              <div className="flex-1 space-y-3 p-3">
                {columnTickets.map((ticket) => {
                  const stationMeta = STATION_META[ticket.station];
                  const StationIcon = stationMeta.icon;
                  return (
                    <article key={ticket.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-slate-700 dark:bg-slate-900">
                      <div className="flex items-start justify-between gap-3 border-b border-dashed border-slate-200 p-3 dark:border-slate-700">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-lg font-black text-slate-950 dark:text-white">{ticket.orderNumber}</span>
                            <span className={`flex items-center gap-1 rounded-full px-2 py-1 text-[9px] font-bold ${stationMeta.className}`}><StationIcon size={11} /> {stationMeta.label}</span>
                          </div>
                          <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">{ticket.destinationLabel}</p>
                        </div>
                        <div className="flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-500 dark:bg-slate-800 dark:text-slate-300"><Clock3 size={11} /> {ticket.createdAt}</div>
                      </div>
                      <div className="space-y-2.5 p-3">
                        {ticket.lines.map((line) => (
                          <div key={`${ticket.id}-${line.menuItemId}`} className="flex gap-2 text-sm">
                            <span className="grid h-6 min-w-6 place-items-center rounded-md bg-slate-900 px-1 text-xs font-black text-white dark:bg-white dark:text-slate-900">{line.quantity}×</span>
                            <div className="min-w-0"><p className="font-bold text-slate-800 dark:text-slate-100">{line.name}</p>{line.note ? <p className="mt-0.5 text-[11px] font-semibold text-rose-500">↳ {line.note}</p> : null}</div>
                          </div>
                        ))}
                      </div>
                      <div className="border-t border-slate-100 p-3 dark:border-slate-800">
                        {ticket.status === 'READY' ? (
                          <Button block type="primary" onClick={() => onComplete(ticket.id)} className="!bg-emerald-600 !font-bold hover:!bg-emerald-700"><CheckCheck size={15} /> Sudah diantar</Button>
                        ) : (
                          <Button block type={ticket.status === 'NEW' ? 'primary' : 'default'} onClick={() => onAdvance(ticket.id)} className={ticket.status === 'NEW' ? '!bg-slate-900 !font-bold dark:!bg-orange-500' : '!font-bold'}>
                            {ticket.status === 'NEW' ? <Flame size={15} /> : <TimerReset size={15} />}
                            {ticket.status === 'NEW' ? 'Mulai buat' : 'Tandai siap'}
                          </Button>
                        )}
                      </div>
                    </article>
                  );
                })}

                {columnTickets.length === 0 ? (
                  <div className="grid min-h-44 place-items-center rounded-xl border border-dashed border-slate-200 text-center dark:border-slate-700">
                    <div><span className="text-2xl">✓</span><p className="mt-2 text-xs font-semibold text-slate-400">Tidak ada tiket</p></div>
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
