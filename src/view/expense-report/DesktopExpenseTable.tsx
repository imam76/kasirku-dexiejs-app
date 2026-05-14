import dayjs from '@/lib/dayjs';
import { FinanceTransaction } from '@/types';
import { formatCurrency } from '@/utils/formatters';
import { useI18n } from '@/hooks/useI18n';

interface DesktopExpenseTableProps {
  transactions: FinanceTransaction[];
  totalExpense: number;
  expenseCategories: { value: string; label: string }[];
}

export default function DesktopExpenseTable({ transactions, totalExpense, expenseCategories }: DesktopExpenseTableProps) {
  const { t } = useI18n();

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-left border-separate border-spacing-0">
        <thead>
          <tr className="text-gray-500 font-normal">
            <th className="py-3 px-4 font-semibold border-b border-gray-100 bg-gray-50/50 rounded-tl-lg">{t('report.dateTime')}</th>
            <th className="py-3 px-4 font-semibold border-b border-gray-100 bg-gray-50/50">{t('report.description')}</th>
            <th className="py-3 px-4 font-semibold border-b border-gray-100 bg-gray-50/50">{t('report.category')}</th>
            <th className="py-3 px-4 font-semibold border-b border-gray-100 bg-gray-50/50 text-right rounded-tr-lg">{t('report.amount')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {transactions.length > 0 ? (
            <>
              {transactions.map((t) => (
                <tr key={t.id} className="hover:bg-gray-50/80 transition-colors group">
                  <td className="py-4 px-4 text-gray-600">
                    {dayjs(t.created_at).tz().format('DD MMM YYYY, HH:mm')}
                  </td>
                  <td className="py-4 px-4 text-gray-800">
                    {t.description || '-'}
                  </td>
                  <td className="py-4 px-4">
                    <span className={`px-3 py-1 rounded-full text-[11px] font-medium inline-block ${t.category === 'Pembelian stok' || t.category === 'PEMBELIAN_STOK'
                        ? 'bg-[#EBF5FF] text-[#2563EB]'
                        : 'bg-[#FEF3E7] text-[#D97706]'
                      }`}>
                      {expenseCategories.find(c => c.value === t.category)?.label || t.category}
                    </span>
                  </td>
                  <td className="py-4 px-4 text-right text-gray-900 font-semibold">
                    {formatCurrency(t.amount)}
                  </td>
                </tr>
              ))}
              <tr className="font-bold text-gray-900 bg-gray-50/30">
                <td colSpan={3} className="py-6 px-4 text-base rounded-bl-lg border-t border-gray-100">{t('report.totalExpense')}</td>
                <td className="py-6 px-4 text-right text-base rounded-br-lg border-t border-gray-100">{formatCurrency(totalExpense)}</td>
              </tr>
            </>
          ) : (
            <tr>
              <td colSpan={4} className="py-12 text-center text-gray-400 italic bg-white rounded-b-lg">
                {t('report.noExpensesForPeriod')}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
