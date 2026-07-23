import { BadgeCheck, Search, Utensils } from 'lucide-react';
import { useMemo, useState } from 'react';
import { formatCurrency } from '@/utils/formatters';
import type { RestaurantMenuItem } from '../types';

interface RestaurantMenuCatalogProps {
  menu: RestaurantMenuItem[];
  categories: string[];
  onAdd: (item: RestaurantMenuItem) => void;
}

export function RestaurantMenuCatalog({ menu, categories, onAdd }: RestaurantMenuCatalogProps) {
  const [category, setCategory] = useState('Semua');
  const [search, setSearch] = useState('');

  const filteredMenu = useMemo(() => {
    const normalized = search.trim().toLocaleLowerCase('id-ID');
    return menu.filter((item) => (
      (category === 'Semua' || item.category === category)
      && (!normalized || `${item.name} ${item.description}`.toLocaleLowerCase('id-ID').includes(normalized))
    ));
  }, [category, menu, search]);

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="border-b border-slate-100 p-4 dark:border-slate-800">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Katalog menu</p>
            <h2 className="mt-1 text-lg font-bold text-slate-900 dark:text-white">Apa yang dipesan?</h2>
          </div>
          <div className="rounded-xl bg-emerald-50 p-2 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300"><Utensils size={20} /></div>
        </div>

        <label className="mt-4 flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 transition focus-within:border-orange-400 focus-within:bg-white focus-within:ring-2 focus-within:ring-orange-100 dark:border-slate-700 dark:bg-slate-800 dark:focus-within:border-orange-500 dark:focus-within:bg-slate-900">
          <Search size={18} className="shrink-0 text-slate-400" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Cari nasi, kopi, camilan..."
            className="min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400 dark:text-white"
          />
          <kbd className="hidden rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] text-slate-400 sm:inline dark:border-slate-700 dark:bg-slate-900">/</kbd>
        </label>

        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {categories.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setCategory(item)}
              className={`shrink-0 rounded-xl px-3 py-2 text-xs font-semibold transition ${category === item
                ? 'bg-orange-500 text-white shadow-sm shadow-orange-200 dark:shadow-none'
                : 'bg-slate-100 text-slate-600 hover:bg-orange-50 hover:text-orange-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'}`}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {filteredMenu.map((item) => {
            const disabled = item.available === false;
            return (
              <button
                key={item.id}
                type="button"
                disabled={disabled}
                onClick={() => onAdd(item)}
                className={`group relative min-h-40 overflow-hidden rounded-2xl border p-3 text-left transition-all ${disabled
                  ? 'cursor-not-allowed border-slate-100 bg-slate-50 opacity-55 dark:border-slate-800 dark:bg-slate-800/60'
                  : 'border-slate-200 bg-white hover:-translate-y-0.5 hover:border-orange-300 hover:shadow-lg hover:shadow-orange-100/60 active:translate-y-0 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-orange-600 dark:hover:shadow-none'}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-orange-50 to-amber-100 text-3xl dark:from-orange-950/50 dark:to-amber-950/40">{item.emoji}</span>
                  {item.popular ? <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"><BadgeCheck size={11} /> Favorit</span> : null}
                </div>
                <h3 className="mt-3 line-clamp-2 text-sm font-bold leading-5 text-slate-900 dark:text-white">{item.name}</h3>
                <p className="mt-1 line-clamp-1 text-[11px] text-slate-400">{disabled ? 'Stok habis' : item.description}</p>
                <div className="mt-3 flex items-end justify-between gap-2">
                  <span className="text-sm font-black text-slate-900 dark:text-white">Rp {formatCurrency(item.price)}</span>
                  {!disabled ? <span className="grid h-7 w-7 place-items-center rounded-lg bg-slate-900 text-lg font-medium text-white transition group-hover:bg-orange-500 dark:bg-white dark:text-slate-900">+</span> : null}
                </div>
              </button>
            );
          })}
        </div>

        {filteredMenu.length === 0 ? (
          <div className="grid min-h-56 place-items-center text-center">
            <div><span className="text-4xl">🍽️</span><p className="mt-3 font-semibold text-slate-700 dark:text-slate-200">Menu tidak ditemukan</p><p className="mt-1 text-xs text-slate-400">Coba kategori atau kata kunci lain.</p></div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
