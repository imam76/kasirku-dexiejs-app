import { formatCurrency } from '@/utils/formatters';

interface TopProduct {
  product_id: string;
  product_name: string;
  category: string;
  totalQuantity: string;
  totalRevenue: number;
  totalProfit: number;
  margin: number;
}

interface TopProductsTableProps {
  products: TopProduct[];
}

export default function TopProductsTable({ products }: TopProductsTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-left border-separate border-spacing-0">
        <thead>
          <tr className="text-gray-500 font-normal">
            <th className="py-3 px-4 font-semibold border-b border-gray-100 bg-gray-50/50 rounded-tl-lg">Produk</th>
            <th className="py-3 px-4 font-semibold border-b border-gray-100 bg-gray-50/50">Kategori</th>
            <th className="py-3 px-4 font-semibold border-b border-gray-100 bg-gray-50/50 text-right">Terjual</th>
            <th className="py-3 px-4 font-semibold border-b border-gray-100 bg-gray-50/50 text-right">Pendapatan</th>
            <th className="py-3 px-4 font-semibold border-b border-gray-100 bg-gray-50/50 text-right">Keuntungan</th>
            <th className="py-3 px-4 font-semibold border-b border-gray-100 bg-gray-50/50 text-right rounded-tr-lg">Margin</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {products.length > 0 ? (
            products.map((p) => (
              <tr key={p.product_id} className="hover:bg-gray-50/80 transition-colors group">
                <td className="py-4 px-4 text-gray-900 font-medium">
                  {p.product_name}
                </td>
                <td className="py-4 px-4">
                  <span className="text-gray-500 italic">{p.category}</span>
                </td>
                <td className="py-4 px-4 text-right">
                  <span className="font-medium text-[#2563EB]">{p.totalQuantity}</span>
                </td>
                <td className="py-4 px-4 text-right text-gray-900">
                  {formatCurrency(p.totalRevenue)}
                </td>
                <td className="py-4 px-4 text-right text-orange-600 font-medium">
                  {formatCurrency(p.totalProfit)}
                </td>
                <td className="py-4 px-4 text-right">
                  <span className={`font-bold ${p.margin >= 20 ? 'text-green-600' : 'text-orange-500'}`}>
                    {p.margin.toFixed(2)}%
                  </span>
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={6} className="py-12 text-center text-gray-400 italic bg-white rounded-b-lg">
                Tidak ada data produk untuk filter ini
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
