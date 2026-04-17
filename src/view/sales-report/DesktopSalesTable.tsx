import dayjs from '@/lib/dayjs';
import { Transaction } from '@/types';
import { formatCurrency } from '@/utils/formatters';

interface DesktopSalesTableProps {
  transactions: Transaction[];
  totalRevenue: number;
}

export default function DesktopSalesTable({ transactions, totalRevenue }: DesktopSalesTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-left border-separate border-spacing-0">
        <thead>
          <tr className="text-gray-500 font-normal">
            <th className="py-3 px-4 font-semibold border-b border-gray-100 bg-gray-50/50 rounded-tl-lg">No. Transaksi</th>
            <th className="py-3 px-4 font-semibold border-b border-gray-100 bg-gray-50/50">Tanggal</th>
            <th className="py-3 px-4 font-semibold border-b border-gray-100 bg-gray-50/50">Metode</th>
            <th className="py-3 px-4 font-semibold border-b border-gray-100 bg-gray-50/50 text-right">Pembayaran</th>
            <th className="py-3 px-4 font-semibold border-b border-gray-100 bg-gray-50/50 text-right">Kembalian</th>
            <th className="py-3 px-4 font-semibold border-b border-gray-100 bg-gray-50/50 text-right rounded-tr-lg">Total Penjualan</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {transactions.length > 0 ? (
            <>
              {transactions.map((t) => (
                <tr key={t.id} className="hover:bg-gray-50/80 transition-colors group">
                  <td className="py-4 px-4 text-gray-800 font-medium">
                    {t.transaction_number}
                  </td>
                  <td className="py-4 px-4 text-gray-600">
                    {dayjs(t.created_at).tz().format('DD MMM YYYY, HH:mm')}
                  </td>
                  <td className="py-4 px-4">
                    <span className={`px-3 py-1 rounded-full text-[11px] font-medium inline-block ${
                      t.payment_method === 'NON_TUNAI'
                        ? 'bg-[#EBF5FF] text-[#2563EB]'
                        : 'bg-[#ECFDF5] text-[#059669]'
                    }`}>
                      {t.payment_method || 'TUNAI'}
                    </span>
                  </td>
                  <td className="py-4 px-4 text-right text-gray-600">
                    {formatCurrency(t.payment_amount)}
                  </td>
                  <td className="py-4 px-4 text-right text-gray-600">
                    {formatCurrency(t.change_amount)}
                  </td>
                  <td className="py-4 px-4 text-right text-gray-900 font-bold">
                    {formatCurrency(t.total_amount)}
                  </td>
                </tr>
              ))}
              <tr className="font-bold text-gray-900 bg-gray-50/30">
                <td colSpan={5} className="py-6 px-4 text-base rounded-bl-lg border-t border-gray-100">Total Penjualan</td>
                <td className="py-6 px-4 text-right text-base rounded-br-lg border-t border-gray-100 text-[#2563EB]">
                  {formatCurrency(totalRevenue)}
                </td>
              </tr>
            </>
          ) : (
            <tr>
              <td colSpan={6} className="py-12 text-center text-gray-400 italic bg-white rounded-b-lg">
                Tidak ada data transaksi untuk periode ini
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
