import { Armchair, Check, Clock3, UserRound, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useI18n } from '@/hooks/useI18n';
import { filterRestaurantTables } from '@/services/restaurantPosService';
import type { RestaurantOrderRecord, RestaurantTableRecord, RestaurantTableStatus } from '@/types';
import { formatRestaurantOrderStartTime } from './restaurantOrderTime';

interface RestaurantFloorPanelProps {
  tables: RestaurantTableRecord[];
  orders: RestaurantOrderRecord[];
  selectedTableId?: string;
  onSelect: (tableId: string) => void;
}

type TableFilter = 'ALL' | RestaurantTableStatus;

export function RestaurantFloorPanel({ tables, orders, selectedTableId, onSelect }: RestaurantFloorPanelProps) {
  const { t } = useI18n();
  const [filter, setFilter] = useState<TableFilter>('ALL');
  const visibleTables = useMemo(() => filterRestaurantTables(tables, filter), [filter, tables]);
  const orderById = useMemo(() => new Map(orders.map((order) => [order.id, order])), [orders]);
  const options: Array<{ value: TableFilter; label: string }> = [
    { value: 'ALL', label: t('restaurantPos.allTables') },
    { value: 'AVAILABLE', label: t('restaurantPos.available') },
    { value: 'OCCUPIED', label: t('restaurantPos.occupied') },
  ];

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-sm">
      <div className="shrink-0 border-b border-blue-50 p-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-black text-slate-900">{t('restaurantPos.selectTable')}</h2>
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-blue-50 text-blue-600"><Armchair size={19} /></span>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={filter === option.value}
              onClick={() => setFilter(option.value)}
              className={`rounded-lg px-2 py-2 text-xs font-bold transition ${filter === option.value
                ? 'bg-white text-blue-700 shadow-sm'
                : 'text-slate-500 hover:text-slate-800'}`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3" data-testid="restaurant-table-scroll">
        <div className="grid grid-cols-2 gap-2">
          {visibleTables.map((table) => {
            const selected = selectedTableId === table.id;
            const occupied = table.status === 'OCCUPIED';
            const activeOrder = table.active_order_id ? orderById.get(table.active_order_id) : undefined;
            const customerName = activeOrder?.customer_name?.trim();
            const visibleCustomerName = customerName && customerName !== activeOrder?.order_number ? customerName : '-';
            const orderStartTime = formatRestaurantOrderStartTime(activeOrder?.opened_at);
            return (
              <button
                key={table.id}
                type="button"
                aria-pressed={selected}
                onClick={() => onSelect(table.id)}
                className={`min-h-24 rounded-xl border p-3 text-left transition ${selected
                  ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-100'
                  : occupied
                    ? 'border-amber-200 bg-amber-50 hover:border-amber-400'
                    : 'border-emerald-100 bg-emerald-50/60 hover:border-emerald-300'}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="font-black text-slate-900">{table.name}</span>
                  {selected
                    ? <span className="grid h-5 w-5 place-items-center rounded-full bg-blue-600 text-white"><Check size={12} /></span>
                    : <span className={`mt-1 h-2.5 w-2.5 rounded-full ${occupied ? 'bg-amber-500' : 'bg-emerald-500'}`} />}
                </div>
                <p className="mt-2 flex items-center gap-1 text-[11px] font-medium text-slate-500">
                  <Users size={12} /> {t('restaurantPos.seats', { count: table.capacity })}
                </p>
                {occupied ? (
                  <p className="mt-1 flex items-center gap-1 truncate text-[10px] font-bold text-amber-900">
                    <UserRound size={11} /> {visibleCustomerName}
                  </p>
                ) : null}
                <div className={`mt-2 flex items-center gap-2 text-[10px] font-bold ${occupied ? 'text-amber-700' : 'text-emerald-700'}`}>
                  {occupied && orderStartTime ? (
                    <span className="flex shrink-0 items-center gap-1">
                      <Clock3 size={11} /> sejak {orderStartTime}
                    </span>
                  ) : occupied ? null : <span>{t('restaurantPos.available')}</span>}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
