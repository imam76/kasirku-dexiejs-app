import { Edit2, Search, Trash2 } from 'lucide-react';
import { useState, useMemo } from 'react';
import type { Product } from '@/types';
import { formatCurrency, getStockStatusClass } from '@/utils/formatters';

interface StockTableProps {
  products: Product[];
  onEdit: (product: Product) => void;
  onDelete: (id: string) => void;
}

type SortField = 'name' | 'sku' | 'purchase_price' | 'selling_price' | 'stock';
type SortDirection = 'asc' | 'desc';

export default function StockTable({ products, onEdit, onDelete }: StockTableProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  // Filter products berdasarkan search query
  const filteredProducts = useMemo(() => {
    return products.filter((product) =>
      product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      product.sku.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [products, searchQuery]);

  // Sort products
  const sortedProducts = useMemo(() => {
    const sorted = [...filteredProducts].sort((a, b) => {
      const aValue = a[sortField];
      const bValue = b[sortField];

      if (typeof aValue === 'string') {
        return sortDirection === 'asc'
          ? aValue.localeCompare(bValue as string)
          : (bValue as string).localeCompare(aValue);
      }

      return sortDirection === 'asc'
        ? (aValue as number) - (bValue as number)
        : (bValue as number) - (aValue as number);
    });

    return sorted;
  }, [filteredProducts, sortField, sortDirection]);

  // Paginate products
  const totalPages = Math.ceil(sortedProducts.length / itemsPerPage);
  const paginatedProducts = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return sortedProducts.slice(startIndex, startIndex + itemsPerPage);
  }, [sortedProducts, currentPage, itemsPerPage]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
    setCurrentPage(1);
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
    setCurrentPage(1);
  };

  return (
    <div className="space-y-4">
      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-3 top-3 text-gray-400" size={18} />
        <input
          type="text"
          placeholder="Cari produk berdasarkan nama atau SKU..."
          value={searchQuery}
          onChange={handleSearchChange}
          className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Desktop & Tablet Table View */}
      <div className="hidden md:block bg-white rounded-lg shadow-md overflow-hidden border border-gray-200">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th
                  onClick={() => handleSort('sku')}
                  className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    SKU
                    {sortField === 'sku' && (
                      <span className="text-xs">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('name')}
                  className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    Nama Produk
                    {sortField === 'name' && (
                      <span className="text-xs">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('purchase_price')}
                  className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    Harga Beli
                    {sortField === 'purchase_price' && (
                      <span className="text-xs">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('selling_price')}
                  className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    Harga Jual
                    {sortField === 'selling_price' && (
                      <span className="text-xs">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </div>
                </th>
                <th className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Margin
                </th>
                <th
                  onClick={() => handleSort('stock')}
                  className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    Stok
                    {sortField === 'stock' && (
                      <span className="text-xs">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </div>
                </th>
                <th className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Aksi
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {paginatedProducts.map((product) => {
                const margin = product.selling_price - product.purchase_price;
                const marginPercent = product.purchase_price > 0
                  ? ((margin / product.purchase_price) * 100).toFixed(1)
                  : '0';

                return (
                  <tr key={product.id} className="hover:bg-gray-50">
                    <td className="px-4 lg:px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {product.sku}
                    </td>
                    <td className="px-4 lg:px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {product.name}
                    </td>
                    <td className="px-4 lg:px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      Rp {formatCurrency(product.purchase_price)}
                    </td>
                    <td className="px-4 lg:px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      Rp {formatCurrency(product.selling_price)}
                    </td>
                    <td className="px-4 lg:px-6 py-4 whitespace-nowrap text-sm">
                      <span className={`px-2 py-1 rounded font-semibold ${margin > 0
                        ? 'bg-green-100 text-green-800'
                        : 'bg-red-100 text-red-800'
                        }`}>
                        Rp {formatCurrency(margin)} ({marginPercent}%)
                      </span>
                    </td>
                    <td className="px-4 lg:px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      <span className={`px-2 py-1 rounded ${getStockStatusClass(product.stock)}`}>
                        {product.stock}
                      </span>
                    </td>
                    <td className="px-4 lg:px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      <div className="flex gap-2">
                        <button
                          onClick={() => onEdit(product)}
                          className="text-blue-600 hover:text-blue-800 transition-colors"
                          title="Edit produk"
                        >
                          <Edit2 size={18} />
                        </button>
                        <button
                          onClick={() => onDelete(product.id)}
                          className="text-red-600 hover:text-red-800 transition-colors"
                          title="Hapus produk"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {paginatedProducts.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            {searchQuery ? 'Tidak ada produk yang sesuai dengan pencarian.' : 'Belum ada produk. Tambahkan produk pertama Anda!'}
          </div>
        )}
      </div>

      {/* Mobile Card View */}
      <div className="md:hidden space-y-3">
        {paginatedProducts.length === 0 && (
          <div className="bg-white rounded-lg shadow-md border border-gray-200 text-center py-8 text-gray-500 text-sm">
            {searchQuery ? 'Tidak ada produk yang sesuai dengan pencarian.' : 'Belum ada produk. Tambahkan produk pertama Anda!'}
          </div>
        )}
        {paginatedProducts.map((product) => {
          const margin = product.selling_price - product.purchase_price;
          const marginPercent = product.purchase_price > 0
            ? ((margin / product.purchase_price) * 100).toFixed(1)
            : '0';

          return (
            <div key={product.id} className="bg-white rounded-lg shadow-md border border-gray-200 p-4">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <p className="text-sm font-bold text-gray-900">{product.name}</p>
                  <p className="text-xs text-gray-500 mt-0.5">SKU: {product.sku}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`px-2 py-1 rounded text-xs font-medium ${getStockStatusClass(product.stock)}`}>
                    Stok: {product.stock}
                  </span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => onEdit(product)}
                      className="text-blue-600 hover:text-blue-800 transition-colors"
                      title="Edit produk"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button
                      onClick={() => onDelete(product.id)}
                      className="text-red-600 hover:text-red-800 transition-colors"
                      title="Hapus produk"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="bg-gray-50 rounded p-2">
                  <p className="text-gray-500 mb-0.5">Harga Beli</p>
                  <p className="font-semibold text-gray-900">Rp {formatCurrency(product.purchase_price)}</p>
                </div>
                <div className="bg-gray-50 rounded p-2">
                  <p className="text-gray-500 mb-0.5">Harga Jual</p>
                  <p className="font-semibold text-gray-900">Rp {formatCurrency(product.selling_price)}</p>
                </div>
                <div className={`rounded p-2 ${margin > 0 ? 'bg-green-50' : 'bg-red-50'}`}>
                  <p className={`mb-0.5 ${margin > 0 ? 'text-green-600' : 'text-red-600'}`}>Margin</p>
                  <p className={`font-semibold ${margin > 0 ? 'text-green-800' : 'text-red-800'}`}>
                    {marginPercent}%
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Pagination Controls — Responsive */}
      {totalPages > 1 && (
        <div className="bg-white rounded-lg shadow-md border border-gray-200 p-3 sm:p-4">

          {/* Info teks: tampil di semua layar */}
          <div className="text-xs sm:text-sm text-gray-600 text-center mb-3">
            Menampilkan{' '}
            <span className="font-medium">
              {paginatedProducts.length > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0}
            </span>
            {' – '}
            <span className="font-medium">
              {Math.min(currentPage * itemsPerPage, sortedProducts.length)}
            </span>
            {' dari '}
            <span className="font-medium">{sortedProducts.length}</span>
            {' produk'}
          </div>

          {/* Baris navigasi + per-halaman */}
          <div className="flex flex-wrap items-center justify-between gap-2">

            {/* Tombol Sebelumnya */}
            <button
              onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
              className="px-3 py-1.5 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed text-xs sm:text-sm"
            >
              ← <span className="hidden sm:inline">Sebelumnya</span>
            </button>

            {/* Nomor halaman */}
            <div className="flex gap-1">
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum;
                if (totalPages <= 5) {
                  pageNum = i + 1;
                } else if (currentPage <= 3) {
                  pageNum = i + 1;
                } else if (currentPage >= totalPages - 2) {
                  pageNum = totalPages - 4 + i;
                } else {
                  pageNum = currentPage - 2 + i;
                }

                return (
                  <button
                    key={pageNum}
                    onClick={() => setCurrentPage(pageNum)}
                    className={`w-7 h-7 sm:w-8 sm:h-8 rounded text-xs sm:text-sm flex items-center justify-center ${currentPage === pageNum
                      ? 'bg-blue-600 text-white'
                      : 'border border-gray-300 hover:bg-gray-50'
                      }`}
                  >
                    {pageNum}
                  </button>
                );
              })}
            </div>

            {/* Tombol Selanjutnya */}
            <button
              onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
              disabled={currentPage === totalPages}
              className="px-3 py-1.5 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed text-xs sm:text-sm"
            >
              <span className="hidden sm:inline">Selanjutnya</span> →
            </button>

            {/* Per halaman — full width di mobile agar tidak terlalu sempit */}
            <div className="flex items-center gap-2 text-xs sm:text-sm w-full sm:w-auto justify-center sm:justify-start border-t sm:border-t-0 pt-2 sm:pt-0">
              <span className="text-gray-600">Per halaman:</span>
              <select
                value={itemsPerPage}
                onChange={(e) => {
                  setItemsPerPage(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="border border-gray-300 rounded px-2 py-1 text-xs sm:text-sm"
              >
                <option value={5}>5</option>
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
              </select>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
