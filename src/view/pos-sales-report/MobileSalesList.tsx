import dayjs from '@/lib/dayjs';
import { Transaction } from '@/types';
import { formatCurrency } from '@/utils/formatters';
import { useI18n } from '@/hooks/useI18n';

interface MobileSalesListProps {
  transactions: Transaction[];
  totalRevenue: number;
  totalDiscount: number;
}

export default function MobileSalesList({ transactions, totalRevenue, totalDiscount }: MobileSalesListProps) {
  const { t } = useI18n();

  if (transactions.length === 0) {
    return (
      <div className="py-12 text-center text-gray-400 italic bg-white rounded-lg border border-dashed border-gray-200">
        {t('report.noTransactionsForPeriod')}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="mt-6 p-4 bg-[#F9FAFB] rounded-xl border border-gray-100">
        <div className="flex justify-between items-center">
          <span className="text-sm font-semibold text-gray-500">{t('report.salesTotal')}</span>
          <div className="text-right">
            <span className="text-lg font-bold text-[#2563EB]">
              {formatCurrency(totalRevenue)}
            </span>
            {totalDiscount > 0 && (
              <div className="text-xs font-semibold text-green-700">
                {t('report.discount')}: -{formatCurrency(totalDiscount)}
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4">
        {transactions.map((transaction) => (
          <div
            key={transaction.id}
            className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm active:bg-gray-50 transition-colors"
          >
            <div className="flex justify-between items-start mb-3">
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                  {dayjs(transaction.created_at).tz().format('DD MMM YYYY, HH:mm')}
                </span>
                <span className="text-[12px] font-bold text-gray-900">
                  {transaction.transaction_number}
                </span>
                <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold w-fit uppercase tracking-tight ${
                  transaction.payment_method === 'NON_TUNAI'
                    ? 'bg-[#EBF5FF] text-[#2563EB]'
                    : 'bg-[#ECFDF5] text-[#059669]'
                }`}>
                  {transaction.payment_method === 'NON_TUNAI' ? t('payment.nonCash') : t('payment.cash')}
                </span>
              </div>
              <div className="text-right">
                <div className="text-sm font-bold text-gray-900">
                  {formatCurrency(transaction.total_amount)}
                </div>
                <div className="text-[10px] text-gray-400 mt-1">
                  {t('history.paid')}: {formatCurrency(transaction.payment_amount)}
                </div>
                {(transaction.discount_amount ?? 0) > 0 && (
                  <div className="text-[10px] font-semibold text-green-700">
                    {t('report.discount')}: -{formatCurrency(transaction.discount_amount ?? 0)}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
