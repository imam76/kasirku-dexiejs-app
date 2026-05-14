import { Button, Drawer, Input, InputNumber, Select } from 'antd';
import type { ChangeEvent } from 'react';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useI18n } from '@/hooks/useI18n';
import { getProductCategoryLabel, getProductCategoryOptions } from '@/i18n/stock';
import type { Product } from '@/types';
import { formatCurrency, getStockStatusClass } from '@/utils/formatters';
import { getPrice } from '@/utils/pricing';
import { Edit2, Search, SlidersHorizontal, Trash2 } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';

interface StockTableProps {
  products: Product[];
  onEdit: (product: Product) => void;
  onDelete: (id: string) => void;
}

type SortField = 'name' | 'sku' | 'purchase_price' | 'selling_price' | 'stock';
type SortDirection = 'asc' | 'desc';
type StockStatusFilter = 'all' | 'out' | 'low' | 'safe';
type SkuStatusFilter = 'all' | 'with' | 'without';
type WholesaleStatusFilter = 'all' | 'with' | 'without';

export default function StockTable({ products, onEdit, onDelete }: StockTableProps) {
  const { t } = useI18n();
  const isMobile = useIsMobile();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [stockStatus, setStockStatus] = useState<StockStatusFilter>('all');
  const [minStock, setMinStock] = useState<number | null>(null);
  const [maxStock, setMaxStock] = useState<number | null>(null);
  const [skuStatus, setSkuStatus] = useState<SkuStatusFilter>('all');
  const [minSellingPrice, setMinSellingPrice] = useState<number | null>(null);
  const [maxSellingPrice, setMaxSellingPrice] = useState<number | null>(null);
  const [minPurchasePrice, setMinPurchasePrice] = useState<number | null>(null);
  const [maxPurchasePrice, setMaxPurchasePrice] = useState<number | null>(null);
  const [wholesaleStatus, setWholesaleStatus] = useState<WholesaleStatusFilter>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isFilterDrawerOpen, setIsFilterDrawerOpen] = useState(false);
  const categoryOptions = useMemo(() => getProductCategoryOptions(t), [t]);
  const stockStatusOptions = useMemo(() => [
    { value: 'all', label: t('stock.allStock') },
    { value: 'out', label: t('stock.outOfStock') },
    { value: 'low', label: t('stock.lowStock') },
    { value: 'safe', label: t('stock.safeStock') },
  ], [t]);
  const skuStatusOptions = useMemo(() => [
    { value: 'all', label: t('stock.allSku') },
    { value: 'with', label: t('stock.withSku') },
    { value: 'without', label: t('stock.withoutSku') },
  ], [t]);
  const wholesaleStatusOptions = useMemo(() => [
    { value: 'all', label: t('stock.allWholesale') },
    { value: 'with', label: t('stock.withWholesale') },
    { value: 'without', label: t('stock.withoutWholesale') },
  ], [t]);

  const activeFilterCount = [
    selectedCategories.length > 0,
    stockStatus !== 'all',
    minStock !== null || maxStock !== null,
    skuStatus !== 'all',
    minSellingPrice !== null || maxSellingPrice !== null,
    minPurchasePrice !== null || maxPurchasePrice !== null,
    wholesaleStatus !== 'all',
  ].filter(Boolean).length;

  const isStockStatusMatch = useCallback((product: Product) => {
    switch (stockStatus) {
      case 'out':
        return product.stock <= 0;
      case 'low':
        return product.stock > 0 && product.stock < 10;
      case 'safe':
        return product.stock >= 10;
      default:
        return true;
    }
  }, [stockStatus]);

  const resetFilters = () => {
    setSearchQuery('');
    setSelectedCategories([]);
    setStockStatus('all');
    setMinStock(null);
    setMaxStock(null);
    setSkuStatus('all');
    setMinSellingPrice(null);
    setMaxSellingPrice(null);
    setMinPurchasePrice(null);
    setMaxPurchasePrice(null);
    setWholesaleStatus('all');
    setCurrentPage(1);
  };

  // Filter products berdasarkan search query
  const filteredProducts = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase();

    return products.filter((product) => {
      const hasSku = Boolean(product.sku?.trim());
      const hasWholesalePrice = Boolean(product.wholesale_prices?.length);

      if (
        normalizedSearch &&
        !product.name.toLowerCase().includes(normalizedSearch) &&
        !(product.sku?.toLowerCase() || '').includes(normalizedSearch)
      ) {
        return false;
      }

      if (selectedCategories.length > 0 && !selectedCategories.includes(product.category || 'non_consumable')) {
        return false;
      }

      if (!isStockStatusMatch(product)) {
        return false;
      }

      if (minStock !== null && product.stock < minStock) {
        return false;
      }

      if (maxStock !== null && product.stock > maxStock) {
        return false;
      }

      if (skuStatus === 'with' && !hasSku) {
        return false;
      }

      if (skuStatus === 'without' && hasSku) {
        return false;
      }

      if (minSellingPrice !== null && product.selling_price < minSellingPrice) {
        return false;
      }

      if (maxSellingPrice !== null && product.selling_price > maxSellingPrice) {
        return false;
      }

      if (minPurchasePrice !== null && product.purchase_price < minPurchasePrice) {
        return false;
      }

      if (maxPurchasePrice !== null && product.purchase_price > maxPurchasePrice) {
        return false;
      }

      if (wholesaleStatus === 'with' && !hasWholesalePrice) {
        return false;
      }

      if (wholesaleStatus === 'without' && hasWholesalePrice) {
        return false;
      }

      return true;
    });
  }, [
    products,
    searchQuery,
    selectedCategories,
    minStock,
    maxStock,
    skuStatus,
    minSellingPrice,
    maxSellingPrice,
    minPurchasePrice,
    maxPurchasePrice,
    wholesaleStatus,
    isStockStatusMatch,
  ]);

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

  const handleSearchChange = (e: ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
    setCurrentPage(1);
  };

  const renderFilterControls = (compact = false) => (
    <div className={compact ? 'grid grid-cols-1 gap-3' : 'grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4'}>
      <Select
        mode="multiple"
        allowClear
        maxTagCount="responsive"
        size="large"
        placeholder={t('stock.categoryPlaceholder')}
        value={selectedCategories}
        onChange={(value) => {
          setSelectedCategories(value);
          setCurrentPage(1);
        }}
        options={categoryOptions}
      />

      <Select
        size="large"
        value={stockStatus}
        onChange={(value) => {
          setStockStatus(value);
          setCurrentPage(1);
        }}
        options={stockStatusOptions}
      />

      <div className="grid grid-cols-2 gap-2">
        <InputNumber
          size="large"
          min={0}
          value={minStock}
          onChange={(value) => {
            setMinStock(value);
            setCurrentPage(1);
          }}
          placeholder={t('stock.minStock')}
          className="w-full"
        />
        <InputNumber
          size="large"
          min={0}
          value={maxStock}
          onChange={(value) => {
            setMaxStock(value);
            setCurrentPage(1);
          }}
          placeholder={t('stock.maxStock')}
          className="w-full"
        />
      </div>

      <Select
        size="large"
        value={skuStatus}
        onChange={(value) => {
          setSkuStatus(value);
          setCurrentPage(1);
        }}
        options={skuStatusOptions}
      />

      <Select
        size="large"
        value={wholesaleStatus}
        onChange={(value) => {
          setWholesaleStatus(value);
          setCurrentPage(1);
        }}
        options={wholesaleStatusOptions}
      />

      <div className="grid grid-cols-2 gap-2">
        <InputNumber
          size="large"
          min={0}
          value={minSellingPrice}
          onChange={(value) => {
            setMinSellingPrice(value);
            setCurrentPage(1);
          }}
          placeholder={t('stock.minSell')}
          className="w-full"
        />
        <InputNumber
          size="large"
          min={0}
          value={maxSellingPrice}
          onChange={(value) => {
            setMaxSellingPrice(value);
            setCurrentPage(1);
          }}
          placeholder={t('stock.maxSell')}
          className="w-full"
        />
      </div>

      <div className={compact ? 'grid grid-cols-2 gap-2' : 'grid grid-cols-2 gap-2 md:col-span-2'}>
        <InputNumber
          size="large"
          min={0}
          value={minPurchasePrice}
          onChange={(value) => {
            setMinPurchasePrice(value);
            setCurrentPage(1);
          }}
          placeholder={t('stock.minBuy')}
          className="w-full"
        />
        <InputNumber
          size="large"
          min={0}
          value={maxPurchasePrice}
          onChange={(value) => {
            setMaxPurchasePrice(value);
            setCurrentPage(1);
          }}
          placeholder={t('stock.maxBuy')}
          className="w-full"
        />
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Search and Filters */}
      <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-gray-400">{t('stock.filterTitle')}</div>
            <p className="mt-1 text-xs text-gray-500">
              {t('stock.filterSummary', { shown: filteredProducts.length, total: products.length })}
            </p>
          </div>
          {(searchQuery || activeFilterCount > 0) && (
            <Button onClick={resetFilters} className="w-full sm:w-auto">
              {t('stock.resetFilter')}
            </Button>
          )}
        </div>

        <div className="space-y-3">
          <div className={isMobile ? 'grid grid-cols-[1fr_auto] gap-2' : 'block'}>
            <Input
              size="large"
              allowClear
              prefix={<Search size={18} className="text-gray-400" />}
              placeholder={t('stock.searchPlaceholder')}
              value={searchQuery}
              onChange={handleSearchChange}
            />
            {isMobile && (
              <Button
                size="large"
                icon={<SlidersHorizontal size={18} />}
                onClick={() => setIsFilterDrawerOpen(true)}
              >
                <span className="hidden min-[380px]:inline">
                  {activeFilterCount > 0 ? t('stock.filterWithCount', { count: activeFilterCount }) : t('stock.filter')}
                </span>
              </Button>
            )}
          </div>

          {!isMobile && renderFilterControls()}
        </div>
      </div>

      <Drawer
        title={t('stock.filterTitle')}
        placement="bottom"
        open={isMobile && isFilterDrawerOpen}
        onClose={() => setIsFilterDrawerOpen(false)}
        size="auto"
        rootClassName="mobile-bottom-drawer"
        styles={{
          body: { padding: 16 },
          header: { padding: '16px 20px' },
        }}
      >
        <div className="space-y-3 pb-3">
          <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-900">
              <SlidersHorizontal size={18} />
              <span>{t('stock.filterParams')}</span>
            </div>
            {renderFilterControls(true)}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button
              size="large"
              disabled={activeFilterCount === 0 && !searchQuery}
              onClick={resetFilters}
              className="h-12"
            >
              {t('transaction.reset')}
            </Button>
            <Button
              size="large"
              type="primary"
              onClick={() => setIsFilterDrawerOpen(false)}
              className="h-12"
            >
              {t('stock.apply')}
            </Button>
          </div>
        </div>
      </Drawer>

      {isMobile ? (
        <div className="space-y-3">
          {paginatedProducts.length === 0 && (
            <div className="bg-white rounded-lg shadow-md border border-gray-200 text-center py-8 text-gray-500 text-sm">
              {searchQuery || activeFilterCount > 0 ? t('stock.noFilteredProducts') : t('stock.noProducts')}
            </div>
          )}
          {paginatedProducts.map((product) => {
            const margin = product.selling_price - product.purchase_price;
            const marginPercent = product.purchase_price > 0
              ? ((margin / product.purchase_price) * 100).toFixed(1)
              : '0';

            return (
              <div key={product.id} onClick={() => setSelectedProduct(product)} className="bg-white rounded-lg shadow-md border border-gray-200 p-4 cursor-pointer">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <p className="text-sm font-bold text-gray-900">{product.name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">SKU: {product.sku || '-'}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{getProductCategoryLabel(product.category || 'non_consumable', t)}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${getStockStatusClass(product.stock)}`}>
                      {t('product.stock')}: {product.stock}
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="bg-gray-50 rounded p-2">
                    <p className="text-gray-500 mb-0.5">{t('stock.purchasePrice')}</p>
                    <p className="font-semibold text-gray-900">Rp {formatCurrency(product.purchase_price)}</p>
                  </div>
                  <div className="bg-gray-50 rounded p-2">
                    <p className="text-gray-500 mb-0.5">{t('stock.sellingPrice')}</p>
                    <p className="font-semibold text-gray-900">Rp {formatCurrency(product.selling_price)}</p>
                  </div>
                  <div className={`rounded p-2 ${margin > 0 ? 'bg-green-50' : 'bg-red-50'}`}>
                    <p className={`mb-0.5 ${margin > 0 ? 'text-green-600' : 'text-red-600'}`}>{t('stock.margin')}</p>
                    <p className={`font-semibold ${margin > 0 ? 'text-green-800' : 'text-red-800'}`}>
                      {marginPercent}%
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-md overflow-hidden border border-gray-200">
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
                    {t('stock.productName')}
                    {sortField === 'name' && (
                      <span className="text-xs">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </div>
                </th>
                <th className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('stock.category')}
                </th>
                <th
                  onClick={() => handleSort('purchase_price')}
                  className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    {t('stock.purchasePrice')}
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
                    {t('stock.sellingPrice')}
                    {sortField === 'selling_price' && (
                      <span className="text-xs">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </div>
                </th>
                <th className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('stock.margin')}
                </th>
                <th
                  onClick={() => handleSort('stock')}
                  className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    {t('product.stock')}
                    {sortField === 'stock' && (
                      <span className="text-xs">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </div>
                </th>
                <th className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('stock.action')}
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
                      {product.sku || '-'}
                    </td>
                    <td className="px-4 lg:px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {product.name}
                    </td>
                    <td className="px-4 lg:px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {getProductCategoryLabel(product.category || 'non_consumable', t)}
                    </td>
                    <td className="px-4 lg:px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      Rp {formatCurrency(product.purchase_price)} <span className="text-xs text-gray-500">/ {product.purchase_unit}</span>
                    </td>
                    <td className="px-4 lg:px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      Rp {formatCurrency(product.selling_price)} <span className="text-xs text-gray-500">/ {product.purchase_unit}</span>
                      {product.selling_unit !== product.purchase_unit && (
                        <div className="text-[10px] text-gray-400">
                          (≈ Rp {formatCurrency(getPrice(product, 1))} / {product.selling_unit})
                        </div>
                      )}
                    </td>
                    <td className="px-4 lg:px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {marginPercent}%
                    </td>
                    <td className="px-4 lg:px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      <span className={`px-2 py-1 rounded ${getStockStatusClass(product.stock)}`}>
                        {product.stock} {product.purchase_unit}
                      </span>
                    </td>
                    <td className="px-4 lg:px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      <div className="flex gap-2">
                        <button
                          onClick={() => onEdit(product)}
                          className="text-blue-600 hover:text-blue-800 transition-colors"
                          title={t('stock.editTitle')}
                        >
                          <Edit2 size={18} />
                        </button>
                        <button
                          onClick={() => onDelete(product.id)}
                          className="text-red-600 hover:text-red-800 transition-colors"
                          title={t('stock.deleteProductTitle')}
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
              {searchQuery || activeFilterCount > 0 ? t('stock.noFilteredProducts') : t('stock.noProducts')}
            </div>
          )}
        </div>
      )}

      {/* Mobile Action Drawer */}
      {isMobile && selectedProduct && (
        <div className="fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black bg-opacity-40 transition-opacity"
            onClick={() => setSelectedProduct(null)}
          />
          <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl shadow-2xl p-5 animate-slide-up flex flex-col max-h-[85vh]">
            <div className="flex justify-center mb-4">
              <div className="w-12 h-1.5 bg-gray-300 rounded-full"></div>
            </div>

            <div className="mb-6">
              <h3 className="text-lg font-bold text-gray-900 line-clamp-2">{selectedProduct.name}</h3>
              <p className="text-sm text-gray-500 mt-1">SKU: {selectedProduct.sku || '-'}</p>
            </div>

            <div className="space-y-3">
              <button
                onClick={() => {
                  onEdit(selectedProduct);
                  setSelectedProduct(null);
                }}
                className="w-full flex items-center gap-4 p-4 bg-gray-50 rounded-xl hover:bg-gray-100 active:bg-gray-200 transition-colors text-left"
              >
                <div className="p-2.5 bg-blue-100 rounded-lg text-blue-600">
                  <Edit2 size={22} />
                </div>
                <div>
                  <span className="block font-bold text-gray-900">{t('stock.editProduct')}</span>
                  <span className="block text-xs text-gray-500 mt-0.5">{t('stock.editDescription')}</span>
                </div>
              </button>

              <button
                onClick={() => {
                  onDelete(selectedProduct.id);
                  setSelectedProduct(null);
                }}
                className="w-full flex items-center gap-4 p-4 bg-gray-50 rounded-xl hover:bg-gray-100 active:bg-gray-200 transition-colors text-left"
              >
                <div className="p-2.5 bg-red-100 rounded-lg text-red-600">
                  <Trash2 size={22} />
                </div>
                <div>
                  <span className="block font-bold text-gray-900">{t('stock.deleteProductTitle')}</span>
                  <span className="block text-xs text-gray-500 mt-0.5">{t('stock.deleteDescription')}</span>
                </div>
              </button>
            </div>

            <button
              onClick={() => setSelectedProduct(null)}
              className="w-full mt-6 py-3 text-gray-500 font-semibold hover:text-gray-700 border-t border-gray-100"
            >
              {t('stock.form.cancel')}
            </button>
          </div>
        </div>
      )}

      {/* Pagination Controls — Responsive */}
      {totalPages > 1 && (
        <div className="bg-white rounded-lg shadow-md border border-gray-200 p-3 sm:p-4">

          <div className="text-xs sm:text-sm text-gray-600 text-center mb-3">
            {t('stock.showingRange', {
              start: paginatedProducts.length > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0,
              end: Math.min(currentPage * itemsPerPage, sortedProducts.length),
              total: sortedProducts.length,
            })}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">

            <button
              onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
              className="px-3 py-1.5 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed text-xs sm:text-sm"
            >
              ← <span className="hidden sm:inline">{t('stock.previous')}</span>
            </button>

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

            <button
              onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
              disabled={currentPage === totalPages}
              className="px-3 py-1.5 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed text-xs sm:text-sm"
            >
              <span className="hidden sm:inline">{t('stock.next')}</span> →
            </button>

            <div className="flex items-center gap-2 text-xs sm:text-sm w-full sm:w-auto justify-center sm:justify-start border-t sm:border-t-0 pt-2 sm:pt-0">
              <span className="text-gray-600">{t('stock.perPage')}:</span>
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
