import dayjs from '@/lib/dayjs';
import { Transaction } from '@/types';
import { formatCurrency } from '@/utils/formatters';
import { useI18n } from '@/hooks/useI18n';

interface DesktopSalesTableProps {
  transactions: Transaction[];
  totalRevenue: number;
  totalDiscount: number;
}

export default function DesktopSalesTable({ transactions, totalRevenue, totalDiscount }: DesktopSalesTableProps) {
  const { t } = useI18n();

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-left border-separate border-spacing-0">
        <thead>
          <tr className="text-gray-500 font-normal">
            <th className="py-3 px-4 font-semibold border-b border-gray-100 bg-gray-50/50 rounded-tl-lg">{t('report.transactionNo')}</th>
            <th className="py-3 px-4 font-semibold border-b border-gray-100 bg-gray-50/50">{t('report.date')}</th>
            <th className="py-3 px-4 font-semibold border-b border-gray-100 bg-gray-50/50">{t('report.method')}</th>
            <th className="py-3 px-4 font-semibold border-b border-gray-100 bg-gray-50/50 text-right">{t('report.payment')}</th>
            <th className="py-3 px-4 font-semibold border-b border-gray-100 bg-gray-50/50 text-right">{t('report.change')}</th>
            <th className="py-3 px-4 font-semibold border-b border-gray-100 bg-gray-50/50 text-right">{t('report.discount')}</th>
            <th className="py-3 px-4 font-semibold border-b border-gray-100 bg-gray-50/50 text-right rounded-tr-lg">{t('report.salesTotal')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {transactions.length > 0 ? (
            <>
              {transactions.map((transaction) => (
                <tr key={transaction.id} className="hover:bg-gray-50/80 transition-colors group">
                  <td className="py-4 px-4 text-gray-800 font-medium">
                    {transaction.transaction_number}
                  </td>
                  <td className="py-4 px-4 text-gray-600">
                    {dayjs(transaction.created_at).tz().format('DD MMM YYYY, HH:mm')}
                  </td>
                  <td className="py-4 px-4">
                    <span className={`px-3 py-1 rounded-full text-[11px] font-medium inline-block ${
                      transaction.payment_method === 'NON_TUNAI'
                        ? 'bg-[#EBF5FF] text-[#2563EB]'
                        : 'bg-[#ECFDF5] text-[#059669]'
                    }`}>
                      {transaction.payment_method === 'NON_TUNAI' ? t('payment.nonCash') : t('payment.cash')}
                    </span>
                  </td>
                  <td className="py-4 px-4 text-right text-gray-600">
                    {formatCurrency(transaction.payment_amount)}
                  </td>
                  <td className="py-4 px-4 text-right text-gray-600">
                    {formatCurrency(transaction.change_amount)}
                  </td>
                  <td className="py-4 px-4 text-right text-green-700">
                    {transaction.discount_amount ? `-${formatCurrency(transaction.discount_amount)}` : '-'}
                  </td>
                  <td className="py-4 px-4 text-right text-gray-900 font-bold">
                    {formatCurrency(transaction.total_amount)}
                  </td>
                </tr>
              ))}
              <tr className="font-bold text-gray-900 bg-gray-50/30">
                <td colSpan={5} className="py-6 px-4 text-base rounded-bl-lg border-t border-gray-100">{t('report.salesTotal')}</td>
                <td className="py-6 px-4 text-right text-base border-t border-gray-100 text-green-700">
                  {totalDiscount > 0 ? `-${formatCurrency(totalDiscount)}` : '-'}
                </td>
                <td className="py-6 px-4 text-right text-base rounded-br-lg border-t border-gray-100 text-[#2563EB]">
                  {formatCurrency(totalRevenue)}
                </td>
              </tr>
            </>
          ) : (
            <tr>
              <td colSpan={7} className="py-12 text-center text-gray-400 italic bg-white rounded-b-lg">
                {t('report.noTransactionsForPeriod')}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
