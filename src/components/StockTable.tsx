import { Button, Drawer, Input, InputNumber, Select, Space, Tag, Tooltip } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { ChangeEvent } from 'react';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useI18n } from '@/hooks/useI18n';
import { getProductCategoryLabel, getProductCategoryOptions } from '@/i18n/stock';
import { isProductUnverified } from '@/services/posQuickItemService';
import type { Product } from '@/types';
import { formatCurrency, getStockStatusClass } from '@/utils/formatters';
import { getProductDisplayPricing } from '@/utils/pricing';
import { BadgeCheck, Edit2, PackagePlus, SlidersHorizontal, Trash2 } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import ManagementTable from './ManagementTable';

interface StockTableProps {
  products: Product[];
  onEdit: (product: Product) => void;
  onDelete: (id: string) => void;
  onOpeningStock: (product: Product) => void;
  onVerify?: (product: Product) => void;
}

type StockStatusFilter = 'all' | 'out' | 'low' | 'safe';
type SkuStatusFilter = 'all' | 'with' | 'without';
type WholesaleStatusFilter = 'all' | 'with' | 'without';
type ProductTypeFilter = 'all' | Product['product_type'];
type PosVisibilityFilter = 'all' | 'visible' | 'hidden';

export default function StockTable({ products, onEdit, onDelete, onOpeningStock, onVerify }: StockTableProps) {
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
  const [productType, setProductType] = useState<ProductTypeFilter>('all');
  const [posVisibility, setPosVisibility] = useState<PosVisibilityFilter>('all');
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
    productType !== 'all',
    posVisibility !== 'all',
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
    setProductType('all');
    setPosVisibility('all');
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

      if (productType !== 'all' && (product.product_type ?? 'FINISHED_GOOD') !== productType) return false;
      if (posVisibility === 'visible' && product.is_visible_in_pos === false) return false;
      if (posVisibility === 'hidden' && product.is_visible_in_pos !== false) return false;

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
    productType,
    posVisibility,
    isStockStatusMatch,
  ]);

  const handleSearchChange = (e: ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  };

  const columns: ColumnsType<Product> = [
    {
      title: 'SKU',
      dataIndex: 'sku',
      key: 'sku',
      sorter: (a, b) => (a.sku ?? '').localeCompare(b.sku ?? ''),
      render: (sku?: string) => sku || '-',
    },
    {
      title: t('stock.productName'),
      dataIndex: 'name',
      key: 'name',
      sorter: (a, b) => a.name.localeCompare(b.name),
      render: (name: string, product) => (
        <span className="font-medium text-gray-900">
          {name}
          {isProductUnverified(product) && (
            <Tag color="gold" className="ml-2">{t('stock.unverified')}</Tag>
          )}
        </span>
      ),
    },
    {
      title: t('stock.category'),
      dataIndex: 'category',
      key: 'category',
      render: (category?: string) => getProductCategoryLabel(category || 'non_consumable', t),
    },
    {
      title: 'Tipe',
      dataIndex: 'product_type',
      key: 'product_type',
      render: (type?: Product['product_type']) => (type === 'RAW_MATERIAL' ? 'Bahan Baku' : 'Barang Jadi'),
    },
    {
      title: 'Status POS',
      dataIndex: 'is_visible_in_pos',
      key: 'is_visible_in_pos',
      render: (isVisible?: boolean) => (
        <Tag color={isVisible === false ? 'default' : 'blue'}>
          {isVisible === false ? 'Tidak tampil di POS' : 'Tampil di POS'}
        </Tag>
      ),
    },
    {
      title: t('stock.purchasePrice'),
      dataIndex: 'purchase_price',
      key: 'purchase_price',
      sorter: (a, b) => a.purchase_price - b.purchase_price,
      render: (_value, product) => (
        <span>
          Rp {formatCurrency(product.purchase_price)} <span className="text-xs text-gray-500">/ {product.purchase_unit}</span>
        </span>
      ),
    },
    {
      title: t('stock.sellingPrice'),
      dataIndex: 'selling_price',
      key: 'selling_price',
      sorter: (a, b) => a.selling_price - b.selling_price,
      render: (_value, product) => (
        <div>
          <span>
            Rp {formatCurrency(product.selling_price)} <span className="text-xs text-gray-500">/ {product.purchase_unit}</span>
          </span>
          {product.selling_unit !== product.purchase_unit && (
            <div className="text-[10px] text-gray-400">
              (≈ Rp {formatCurrency(getProductDisplayPricing(product).basePrice)} / {product.selling_unit})
            </div>
          )}
        </div>
      ),
    },
    {
      title: t('stock.margin'),
      key: 'margin',
      render: (_value, product) => {
        const margin = product.selling_price - product.purchase_price;
        const marginPercent = product.purchase_price > 0
          ? ((margin / product.purchase_price) * 100).toFixed(1)
          : '0';
        return `${marginPercent}%`;
      },
    },
    {
      title: t('product.stock'),
      dataIndex: 'stock',
      key: 'stock',
      sorter: (a, b) => a.stock - b.stock,
      render: (_value, product) => (
        <span className={`px-2 py-1 rounded ${getStockStatusClass(product.stock)}`}>
          {product.stock} {product.purchase_unit}
        </span>
      ),
    },
    {
      title: t('stock.action'),
      key: 'action',
      fixed: 'right',
      render: (_value, product) => (
        <Space>
          {onVerify && isProductUnverified(product) && (
            <Tooltip title={t('stock.verifyAction')}>
              <Button
                type="text"
                className="text-amber-600"
                icon={<BadgeCheck size={16} />}
                onClick={() => onVerify(product)}
              />
            </Tooltip>
          )}
          <Tooltip title={t('stock.openingStockAction')}>
            <Button
              type="text"
              className="text-emerald-600"
              icon={<PackagePlus size={16} />}
              onClick={() => onOpeningStock(product)}
            />
          </Tooltip>
          <Tooltip title={t('stock.editTitle')}>
            <Button
              type="text"
              className="text-blue-600"
              icon={<Edit2 size={16} />}
              onClick={() => onEdit(product)}
            />
          </Tooltip>
          <Tooltip title={t('stock.deleteProductTitle')}>
            <Button danger type="text" icon={<Trash2 size={16} />} onClick={() => onDelete(product.id)} />
          </Tooltip>
        </Space>
      ),
    },
  ];

  const renderFilterControls = (compact = false) => (
    <div className={compact ? 'grid grid-cols-1 gap-3' : 'grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4'}>
      <Select
        mode="multiple"
        allowClear
        maxTagCount="responsive"
        placeholder={t('stock.categoryPlaceholder')}
        value={selectedCategories}
        onChange={setSelectedCategories}
        options={categoryOptions}
      />

      <Select
        value={stockStatus}
        onChange={setStockStatus}
        options={stockStatusOptions}
      />

      <div className="grid grid-cols-2 gap-2">
        <InputNumber
          min={0}
          value={minStock}
          onChange={setMinStock}
          placeholder={t('stock.minStock')}
          style={{ width: '100%' }}
        />
        <InputNumber
          min={0}
          value={maxStock}
          onChange={setMaxStock}
          placeholder={t('stock.maxStock')}
          style={{ width: '100%' }}
        />
      </div>

      <Select
        value={skuStatus}
        onChange={setSkuStatus}
        options={skuStatusOptions}
      />

      <Select
        value={wholesaleStatus}
        onChange={setWholesaleStatus}
        options={wholesaleStatusOptions}
      />

      <Select
        value={productType}
        onChange={setProductType}
        options={[
          { value: 'all', label: 'Semua tipe' },
          { value: 'FINISHED_GOOD', label: 'Barang Jadi' },
          { value: 'RAW_MATERIAL', label: 'Bahan Baku' },
        ]}
      />

      <Select
        value={posVisibility}
        onChange={setPosVisibility}
        options={[
          { value: 'all', label: 'Semua' },
          { value: 'visible', label: 'Tampil di POS' },
          { value: 'hidden', label: 'Tidak tampil di POS' },
        ]}
      />

      <div className="grid grid-cols-2 gap-2">
        <InputNumber
          min={0}
          value={minSellingPrice}
          onChange={setMinSellingPrice}
          placeholder={t('stock.minSell')}
          style={{ width: '100%' }}
        />
        <InputNumber
          min={0}
          value={maxSellingPrice}
          onChange={setMaxSellingPrice}
          placeholder={t('stock.maxSell')}
          style={{ width: '100%' }}
        />
      </div>

      <div className={compact ? 'grid grid-cols-2 gap-2' : 'grid grid-cols-2 gap-2 md:col-span-2'}>
        <InputNumber
          min={0}
          value={minPurchasePrice}
          onChange={setMinPurchasePrice}
          placeholder={t('stock.minBuy')}
          style={{ width: '100%' }}
        />
        <InputNumber
          min={0}
          value={maxPurchasePrice}
          onChange={setMaxPurchasePrice}
          placeholder={t('stock.maxBuy')}
          style={{ width: '100%' }}
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
            <Input.Search
              allowClear
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

      <ManagementTable<Product>
        columns={columns}
        dataSource={filteredProducts}
        scrollX={1300}
        pageSizeOptions={['5', '10', '20', '50']}
        showTotal={(total, range) => t('stock.showingRange', { start: range[0], end: range[1], total })}
        emptyText={searchQuery || activeFilterCount > 0 ? t('stock.noFilteredProducts') : t('stock.noProducts')}
      />
    </div>
  );
}
