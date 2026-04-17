import dayjs from '@/lib/dayjs';
import { FinanceTransaction } from '@/types';
import { formatCurrency } from '@/utils/formatters';

interface MobileExpenseListProps {
  transactions: FinanceTransaction[];
  totalExpense: number;
  expenseCategories: { value: string; label: string }[];
}

export default function MobileExpenseList({ transactions, totalExpense, expenseCategories }: MobileExpenseListProps) {
  if (transactions.length === 0) {
    return (
      <div className="py-12 text-center text-gray-400 italic bg-white rounded-lg border border-dashed border-gray-200">
        Tidak ada data pengeluaran untuk periode ini
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="mt-6 p-4 bg-[#F9FAFB] rounded-xl border border-gray-100">
        <div className="flex justify-between items-center">
          <span className="text-sm font-semibold text-gray-500">Total Pengeluaran</span>
          <span className="text-lg font-bold text-[#2563EB]">
            {formatCurrency(totalExpense)}
          </span>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4">
        {transactions.map((t) => (
          <div
            key={t.id}
            className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm active:bg-gray-50 transition-colors"
          >
            <div className="flex justify-between items-start mb-3">
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                  {dayjs(t.created_at).tz().format('DD MMM YYYY, HH:mm')}
                </span>
                <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold w-fit uppercase tracking-tight ${t.category === 'Pembelian stok' || t.category === 'PEMBELIAN_STOK'
                  ? 'bg-[#EBF5FF] text-[#2563EB]'
                  : 'bg-[#FEF3E7] text-[#D97706]'
                  }`}>
                  {expenseCategories.find(c => c.value === t.category)?.label || t.category}
                </span>
              </div>
              <div className="text-right">
                <div className="text-sm font-bold text-gray-900">
                  {formatCurrency(t.amount)}
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-gray-50">
              <p className="text-gray-600 text-sm leading-relaxed">
                {t.description || <span className="text-gray-300 italic">Tanpa keterangan</span>}
              </p>
            </div>
          </div>
        ))}
      </div>


    </div>
  );
}
