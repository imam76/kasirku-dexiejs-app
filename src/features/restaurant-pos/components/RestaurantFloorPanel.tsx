import { Armchair, Check, Clock3, Sparkles, Users } from 'lucide-react';
import type { RestaurantArea, RestaurantTable, RestaurantTableStatus } from '../types';

const TABLE_STATUS: Record<RestaurantTableStatus, { label: string; dot: string; card: string }> = {
  AVAILABLE: { label: 'Tersedia', dot: 'bg-emerald-500', card: 'border-emerald-100 bg-emerald-50/40 hover:border-emerald-300' },
  OCCUPIED: { label: 'Terisi', dot: 'bg-amber-500', card: 'border-amber-200 bg-amber-50/60 hover:border-amber-400' },
  RESERVED: { label: 'Reservasi', dot: 'bg-violet-500', card: 'border-violet-200 bg-violet-50/60 hover:border-violet-400' },
  CLEANING: { label: 'Dibersihkan', dot: 'bg-sky-500', card: 'cursor-not-allowed border-sky-100 bg-sky-50/50 opacity-70' },
};

interface RestaurantFloorPanelProps {
  areas: RestaurantArea[];
  tables: RestaurantTable[];
  selectedAreaId: string;
  selectedTableId: string;
  onAreaChange: (areaId: string) => void;
  onTableSelect: (tableId: string) => void;
  onMarkAvailable: (tableId: string) => void;
}

export function RestaurantFloorPanel({
  areas,
  tables,
  selectedAreaId,
  selectedTableId,
  onAreaChange,
  onTableSelect,
  onMarkAvailable,
}: RestaurantFloorPanelProps) {
  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="border-b border-slate-100 p-4 dark:border-slate-800">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Floor plan</p>
            <h2 className="mt-1 text-lg font-bold text-slate-900 dark:text-white">Pilih meja</h2>
          </div>
          <div className="rounded-xl bg-orange-50 p-2 text-orange-600 dark:bg-orange-950/40 dark:text-orange-300">
            <Armchair size={20} />
          </div>
        </div>

        <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
          {areas.map((area) => (
            <button
              key={area.id}
              type="button"
              onClick={() => onAreaChange(area.id)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition ${selectedAreaId === area.id
                ? 'bg-slate-900 text-white shadow-sm dark:bg-white dark:text-slate-900'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'}`}
            >
              {area.name}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-2">
          {tables.map((table) => {
            const status = TABLE_STATUS[table.status];
            const selected = table.id === selectedTableId;
            return (
              <div key={table.id} className="relative">
                <button
                  type="button"
                  disabled={table.status === 'CLEANING'}
                  onClick={() => onTableSelect(table.id)}
                  aria-pressed={selected}
                  className={`min-h-28 w-full rounded-2xl border p-3 text-left transition-all ${status.card} ${selected
                    ? 'ring-2 ring-orange-500 ring-offset-2 dark:ring-offset-slate-900'
                    : ''}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-base font-black text-slate-900 dark:text-white">{table.name}</span>
                    {selected ? (
                      <span className="grid h-5 w-5 place-items-center rounded-full bg-orange-500 text-white"><Check size={13} strokeWidth={3} /></span>
                    ) : (
                      <span className={`mt-1 h-2.5 w-2.5 rounded-full ${status.dot}`} />
                    )}
                  </div>
                  <div className="mt-2 flex items-center gap-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    <Users size={13} /> {table.capacity} kursi
                  </div>
                  <div className="mt-2 truncate text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                    {table.activeSince ? <span className="flex items-center gap-1"><Clock3 size={12} /> sejak {table.activeSince}</span> : null}
                    {table.reservationName ? table.reservationName : null}
                    {!table.activeSince && !table.reservationName ? status.label : null}
                  </div>
                </button>
                {table.status === 'CLEANING' ? (
                  <button
                    type="button"
                    onClick={() => onMarkAvailable(table.id)}
                    className="absolute bottom-2 left-2 right-2 flex items-center justify-center gap-1 rounded-lg bg-white/95 py-1.5 text-[10px] font-bold text-sky-700 shadow-sm ring-1 ring-sky-100 hover:bg-sky-50"
                  >
                    <Sparkles size={12} /> Tandai siap
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-2 border-t border-slate-100 px-4 py-3 text-[10px] font-medium text-slate-500 dark:border-slate-800 dark:text-slate-400">
        {(Object.entries(TABLE_STATUS) as Array<[RestaurantTableStatus, typeof TABLE_STATUS[RestaurantTableStatus]]>).map(([key, value]) => (
          <span key={key} className="flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${value.dot}`} />{value.label}</span>
        ))}
      </div>
    </section>
  );
}
