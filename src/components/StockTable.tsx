import { Button, Dropdown, Input, InputNumber, Select, Space, Tag, Tooltip } from 'antd';
import type { MenuProps } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { ChangeEvent, Key } from 'react';
import { useI18n } from '@/hooks/useI18n';
import { getProductCategoryLabel, getProductCategoryOptions } from '@/i18n/stock';
import { isProductUnverified } from '@/services/posQuickItemService';
import type { Product } from '@/types';
import { formatCurrency } from '@/utils/formatters';
import { getStockStatus, getStockStatusClass, resolveProductMinStock } from '@/utils/stockStatus';
import { getProductDisplayPricing } from '@/utils/pricing';
import { BadgeCheck, CheckSquare, Edit2, EyeOff, Package, PackagePlus, Plus, ShoppingCart, SlidersHorizontal, Trash2 } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import ManagementTable from './ManagementTable';
import {
  MobileCrudBottomSheet,
  ResponsiveCrudCollection,
  type MobileCrudAction,
  type MobileCrudFloatingAction,
} from './mobile-crud';

export interface StockBulkAction {
  key: string;
  label: string;
  onSelect: (products: Product[]) => void;
}

interface StockTableProps {
  products: Product[];
  onEdit: (product: Product) => void;
  onDelete: (id: string) => void;
  onOpeningStock: (product: Product) => void;
  onVerify?: (product: Product) => void;
  onAdd?: () => void;
  loading?: boolean;
  bulkActions?: { label: string; items: StockBulkAction[] };
}

type StockStatusFilter = 'all' | 'out' | 'low' | 'safe';
type SkuStatusFilter = 'all' | 'with' | 'without';
type WholesaleStatusFilter = 'all' | 'with' | 'without';
type ProductTypeFilter = 'all' | Product['product_type'];
type PosVisibilityFilter = 'all' | 'visible' | 'hidden';

export default function StockTable({
  products,
  onEdit,
  onDelete,
  onOpeningStock,
  onVerify,
  onAdd,
  loading = false,
  bulkActions,
}: StockTableProps) {
  const { t } = useI18n();
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
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isBulkSheetOpen, setIsBulkSheetOpen] = useState(false);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
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
  const activeSearchAndFilterCount = activeFilterCount + (searchQuery.trim() ? 1 : 0);

  const isStockStatusMatch = useCallback((product: Product) => {
    if (stockStatus === 'all') return true;
    const status = getStockStatus(product);
    if (stockStatus === 'out') return status === 'habis';
    if (stockStatus === 'low') return status === 'menipis';
    return status === 'tersedia';
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

  const selectedProduct = selectedProductId
    ? filteredProducts.find((product) => product.id === selectedProductId) ?? null
    : null;
  const closeDetailSheet = () => setSelectedProductId(null);

  const selectionEnabled = Boolean(bulkActions?.items.length);
  const productById = useMemo(
    () => (selectionEnabled ? new Map(products.map((product) => [product.id, product])) : null),
    [products, selectionEnabled],
  );
  /** Pilihan sengaja bertahan lintas filter supaya user bisa memungut dari beberapa saringan. */
  const selectedProducts = useMemo(() => (productById
    ? selectedIds.flatMap((id) => {
      const product = productById.get(id);
      return product ? [product] : [];
    })
    : []), [productById, selectedIds]);
  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const rowSelection = useMemo(() => (selectionEnabled ? {
    selectedRowKeys: selectedIds,
    preserveSelectedRowKeys: true,
    onChange: (keys: Key[]) => setSelectedIds(keys as string[]),
  } : undefined), [selectedIds, selectionEnabled]);
  /** Mode pilih berakhir sendiri saat centang terakhir dilepas. */
  const toggleSelected = useCallback((product: Product) => {
    const nextIds = selectedIdSet.has(product.id)
      ? selectedIds.filter((id) => id !== product.id)
      : [...selectedIds, product.id];

    setSelectedIds(nextIds);
    if (!nextIds.length) setIsSelectionMode(false);
  }, [selectedIdSet, selectedIds]);
  const startSelection = useCallback((product: Product) => {
    setIsSelectionMode(true);
    setSelectedIds((current) => (current.includes(product.id) ? current : [...current, product.id]));
  }, []);
  const listSelection = useMemo(() => (selectionEnabled ? {
    active: isSelectionMode,
    isSelected: (product: Product) => selectedIdSet.has(product.id),
    onToggle: toggleSelected,
    onLongPress: startSelection,
    getAriaLabel: (product: Product) => t('stock.mobile.selectAria', { name: product.name }),
  } : undefined), [isSelectionMode, selectedIdSet, selectionEnabled, startSelection, t, toggleSelected]);

  const clearSelection = useCallback(() => {
    setSelectedIds([]);
    setIsSelectionMode(false);
  }, []);
  /** Menambahkan seluruh hasil filter tanpa membuang pilihan dari filter sebelumnya. */
  const selectAllFiltered = useCallback(() => {
    setSelectedIds((current) => [
      ...current,
      ...filteredProducts.filter((product) => !current.includes(product.id)).map((product) => product.id),
    ]);
    setIsSelectionMode(true);
  }, [filteredProducts]);
  const runBulkAction = useCallback((key: string) => {
    setIsBulkSheetOpen(false);
    bulkActions?.items.find((action) => action.key === key)?.onSelect(selectedProducts);
  }, [bulkActions, selectedProducts]);
  const bulkMenuItems = useMemo<MenuProps['items']>(
    () => bulkActions?.items.map(({ key, label }) => ({ key, label })) ?? [],
    [bulkActions],
  );

  const renderPriceStockGrid = (product: Product) => (
    <div className="grid grid-cols-2 gap-2">
      <span className="rounded-lg bg-gray-50 p-2.5 dark:bg-gray-800">
        <span className="block text-[10px] font-bold uppercase tracking-wide text-gray-400">
          {t('stock.sellingPrice')}
        </span>
        <span className="mt-0.5 block font-bold text-gray-900 dark:text-gray-100">
          Rp {formatCurrency(product.selling_price)}
        </span>
        <span className="block text-[10px] text-gray-500">/ {product.purchase_unit}</span>
      </span>
      <span className="rounded-lg bg-gray-50 p-2.5 dark:bg-gray-800">
        <span className="block text-[10px] font-bold uppercase tracking-wide text-gray-400">
          {t('product.stock')}
        </span>
        <span
          className={`mt-1 inline-flex rounded px-2 py-0.5 text-sm font-bold ${getStockStatusClass(product)}`}
          title={t('stock.minStockBadgeHint', {
            min: resolveProductMinStock(product),
            unit: product.purchase_unit,
          })}
        >
          {product.stock} {product.purchase_unit}
        </span>
      </span>
    </div>
  );

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
        <span
          className={`px-2 py-1 rounded ${getStockStatusClass(product)}`}
          title={t('stock.minStockBadgeHint', {
            min: resolveProductMinStock(product),
            unit: product.purchase_unit,
          })}
        >
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

  const floatingActions: MobileCrudFloatingAction[] = [
    ...(onAdd ? [
      {
        key: 'add',
        type: 'primary' as const,
        icon: <Plus size={24} />,
        label: t('stock.add'),
        tourId: 'stock-add-product',
        onClick: onAdd,
      },
      {
        key: 'filter',
        icon: <SlidersHorizontal size={22} />,
        label: t('stock.filterTitle'),
        badge: { count: activeSearchAndFilterCount, color: '#fa8c16' },
        testId: 'stock-search-filter-fab',
        onClick: () => setIsFilterDrawerOpen(true),
      },
    ] : []),
    // FAB kontekstual ditumpuk paling atas supaya tombol lama tidak berpindah.
    ...(bulkActions && selectedProducts.length > 0 ? [{
      key: 'bulk',
      type: 'primary' as const,
      icon: <ShoppingCart size={22} />,
      label: bulkActions.label,
      badge: { count: selectedProducts.length, color: '#0F766E' },
      testId: 'stock-bulk-purchase-fab',
      onClick: () => setIsBulkSheetOpen(true),
    }] : []),
  ];

  return (
    <div className="space-y-4">
      <ResponsiveCrudCollection<Product>
        desktop={(
          <>
            <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
              <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-gray-400">
                    {t('stock.filterTitle')}
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    {t('stock.filterSummary', { shown: filteredProducts.length, total: products.length })}
                  </p>
                </div>
                {(searchQuery || activeFilterCount > 0) ? (
                  <Button onClick={resetFilters} className="w-full sm:w-auto">
                    {t('stock.resetFilter')}
                  </Button>
                ) : null}
              </div>

              <div className="space-y-3">
                <Input.Search
                  allowClear
                  placeholder={t('stock.searchPlaceholder')}
                  value={searchQuery}
                  onChange={handleSearchChange}
                />
                {renderFilterControls()}
              </div>
            </div>

            {bulkActions && selectedProducts.length > 0 ? (
              <div className="flex flex-wrap items-center gap-3 rounded-xl border border-teal-100 bg-teal-50 px-4 py-3">
                <span className="text-sm font-semibold text-teal-900">
                  {t('stock.selectedCount', { count: selectedProducts.length })}
                </span>
                <Button size="small" onClick={selectAllFiltered}>
                  {t('stock.selectAll', { count: filteredProducts.length })}
                </Button>
                <Button size="small" onClick={clearSelection}>
                  {t('stock.clearSelection')}
                </Button>
                <span className="ml-auto">
                  <Dropdown
                    trigger={['click']}
                    menu={{ items: bulkMenuItems, onClick: ({ key }) => runBulkAction(key) }}
                  >
                    <Button type="primary" icon={<ShoppingCart size={16} />}>
                      {bulkActions.label}
                    </Button>
                  </Dropdown>
                </span>
              </div>
            ) : null}

            <ManagementTable<Product>
              columns={columns}
              dataSource={filteredProducts}
              loading={loading}
              rowSelection={rowSelection}
              scrollX={1300}
              pageSizeOptions={['5', '10', '20', '50']}
              showTotal={(total, range) => t('stock.showingRange', {
                start: range[0],
                end: range[1],
                total,
              })}
              emptyText={searchQuery || activeFilterCount > 0
                ? t('stock.noFilteredProducts')
                : t('stock.noProducts')}
            />
          </>
        )}
        mobileFilter={{
          open: isFilterDrawerOpen,
          title: t('stock.filterTitle'),
          onClose: () => setIsFilterDrawerOpen(false),
          onReset: resetFilters,
          resetLabel: t('transaction.reset'),
          applyLabel: t('stock.apply'),
          resetDisabled: activeFilterCount === 0 && !searchQuery,
          children: (
            <>
              <Input.Search
                size="large"
                allowClear
                autoFocus
                aria-label={t('stock.searchPlaceholder')}
                placeholder={t('stock.searchPlaceholder')}
                value={searchQuery}
                onChange={handleSearchChange}
              />

              <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-900">
                  <SlidersHorizontal size={18} />
                  <span>{t('stock.filterParams')}</span>
                </div>
                {renderFilterControls(true)}
              </div>
            </>
          ),
        }}
        mobileDetail={{
          open: selectedProduct !== null,
          onClose: closeDetailSheet,
          closable: false,
          testId: 'stock-detail-sheet',
          bodyStyle: { padding: '20px 20px 24px' },
          children: selectedProduct ? (
            <div className="space-y-4">
              <div className="mx-auto h-1 w-9 rounded-full bg-gray-200 dark:bg-gray-700" />
              <div className="flex items-center gap-3">
                <span className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                  <Package aria-hidden size={22} />
                </span>
                <div className="min-w-0">
                  <div className="truncate text-base font-extrabold text-gray-900 dark:text-gray-100">
                    {selectedProduct.name}
                  </div>
                  <div className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">
                    {selectedProduct.sku?.trim() || t('stock.mobile.noSku')}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5">
                <Tag className="m-0">{getProductCategoryLabel(selectedProduct.category || 'non_consumable', t)}</Tag>
                <Tag className="m-0" color={selectedProduct.product_type === 'RAW_MATERIAL' ? 'cyan' : 'blue'}>
                  {selectedProduct.product_type === 'RAW_MATERIAL' ? t('stock.mobile.rawMaterial') : t('stock.mobile.finishedGood')}
                </Tag>
              </div>

              {renderPriceStockGrid(selectedProduct)}

              <div className="grid grid-cols-2 gap-2.5">
                <Button
                  size="large"
                  className="h-12"
                  onClick={() => {
                    closeDetailSheet();
                    onOpeningStock(selectedProduct);
                  }}
                >
                  {t('stock.openingStockAction')}
                </Button>
                <Button
                  type="primary"
                  size="large"
                  className="h-12"
                  onClick={() => {
                    closeDetailSheet();
                    onEdit(selectedProduct);
                  }}
                >
                  {t('stock.editProduct')}
                </Button>
              </div>
            </div>
          ) : null,
        }}
        mobileList={{
          items: filteredProducts,
          getKey: (product) => product.id,
          loading,
          resetKey: JSON.stringify([
            searchQuery,
            selectedCategories.join(','),
            stockStatus,
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
          ]),
          resultSummary: isSelectionMode ? (
            <span className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">
                {t('stock.selectedCount', { count: selectedProducts.length })}
              </span>
              <Button size="small" type="link" className="h-auto p-0" onClick={selectAllFiltered}>
                {t('stock.selectAll', { count: filteredProducts.length })}
              </Button>
              <Button size="small" type="link" className="h-auto p-0" onClick={clearSelection}>
                {t('stock.clearSelection')}
              </Button>
            </span>
          ) : t('stock.filterSummary', { shown: filteredProducts.length, total: products.length }),
          emptyText: searchQuery || activeFilterCount > 0
            ? t('stock.noFilteredProducts')
            : t('stock.noProducts'),
          emptyAction: !searchQuery && activeFilterCount === 0 && onAdd ? (
            <Button type="primary" size="large" icon={<Plus size={18} />} onClick={onAdd}>
              {t('stock.addProduct')}
            </Button>
          ) : undefined,
          loadMoreLabel: (remaining) => t('stock.mobile.loadMore', { count: remaining }),
          getItemAriaLabel: (product) => t('stock.mobile.detailAria', { name: product.name }),
          getActionsAriaLabel: (product) => t('stock.mobile.actionsAria', { name: product.name }),
          getActionSheetTitle: (product) => product.name,
          onItemClick: (product) => setSelectedProductId(product.id),
          selection: listSelection,
          getActions: (product): MobileCrudAction<Product>[] => [
            {
              key: 'select',
              label: t('stock.mobile.selectAction'),
              description: t('stock.mobile.selectDescription'),
              icon: <CheckSquare aria-hidden size={19} />,
              hidden: !selectionEnabled,
              onSelect: startSelection,
            },
            {
              key: 'edit',
              label: t('stock.editTitle'),
              description: t('stock.editDescription'),
              icon: <Edit2 aria-hidden size={19} />,
              onSelect: onEdit,
            },
            {
              key: 'verify',
              label: t('stock.verifyAction'),
              description: t('stock.verifyDescription'),
              icon: <BadgeCheck aria-hidden size={19} />,
              hidden: !onVerify || !isProductUnverified(product),
              onSelect: (item) => onVerify?.(item),
            },
            {
              key: 'opening-stock',
              label: t('stock.openingStockAction'),
              description: t('stock.openingStockDescription'),
              icon: <PackagePlus aria-hidden size={19} />,
              onSelect: onOpeningStock,
            },
            {
              key: 'delete',
              label: t('stock.deleteProductTitle'),
              description: t('stock.deleteDescription'),
              icon: <Trash2 aria-hidden size={19} />,
              danger: true,
              onSelect: (item) => onDelete(item.id),
            },
          ],
          /** Sisanya sudah tersedia di detail sheet, jadi card cukup satu baris. */
          renderItem: (product) => (
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                <Package aria-hidden size={19} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-[15px] font-bold text-gray-900 dark:text-gray-100">
                    {product.name}
                  </span>
                  {product.is_visible_in_pos === false ? (
                    <EyeOff aria-label={t('stock.mobile.hiddenFromPos')} size={16} className="shrink-0 text-gray-400" />
                  ) : null}
                  <span
                    className={`shrink-0 rounded px-2 py-0.5 text-xs font-bold ${getStockStatusClass(product)}`}
                    title={t('stock.minStockBadgeHint', {
                      min: resolveProductMinStock(product),
                      unit: product.purchase_unit,
                    })}
                  >
                    {product.stock} {product.purchase_unit}
                  </span>
                </span>
                <span className="mt-0.5 flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                  <span className="min-w-0 truncate">{product.sku?.trim() || t('stock.mobile.noSku')}</span>
                  {isProductUnverified(product) ? (
                    <Tag className="m-0 leading-4" color="gold">{t('stock.unverified')}</Tag>
                  ) : null}
                </span>
              </span>
            </div>
          ),
        }}
        mobileFloatingActions={floatingActions.length ? { actions: floatingActions } : undefined}
      />

      {bulkActions ? (
        <MobileCrudBottomSheet
          title={bulkActions.label}
          open={isBulkSheetOpen}
          onClose={() => setIsBulkSheetOpen(false)}
          rootClassName="mobile-crud-action-sheet"
          bodyStyle={{ padding: '8px 16px 16px' }}
        >
          <div className="space-y-1 pb-2">
            <p className="px-3 pb-1 text-xs text-gray-500">
              {t('stock.selectedCount', { count: selectedProducts.length })}
            </p>
            {bulkActions.items.map((action) => (
              <button
                key={action.key}
                type="button"
                className="flex min-h-14 w-full items-center gap-3 rounded-xl px-3 py-2 text-left font-semibold outline-none transition-colors hover:bg-gray-100 dark:hover:bg-gray-800"
                onClick={() => runBulkAction(action.key)}
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-current/10">
                  <ShoppingCart aria-hidden size={19} />
                </span>
                {action.label}
              </button>
            ))}
            <button
              type="button"
              className="flex min-h-14 w-full items-center gap-3 rounded-xl px-3 py-2 text-left font-semibold text-red-600 outline-none transition-colors hover:bg-red-50 dark:hover:bg-red-950/30"
              onClick={() => {
                setIsBulkSheetOpen(false);
                clearSelection();
              }}
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-current/10">
                <Trash2 aria-hidden size={19} />
              </span>
              {t('stock.clearSelection')}
            </button>
          </div>
        </MobileCrudBottomSheet>
      ) : null}
    </div>
  );
}
