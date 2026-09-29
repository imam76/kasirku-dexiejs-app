import { useMemo, useState } from 'react';
import { Alert, App, Button, Card, Empty, Input, Popover, Select, Table, Tag, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { InfoCircleOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import ExportActions from '@/components/ExportActions';
import { useBaseCurrency } from '@/hooks/useBaseCurrency';
import { useI18n } from '@/hooks/useI18n';
import { useInventoryReport } from '@/hooks/useInventoryReport';
import { getProductCategoryLabel } from '@/i18n/stock';
import type { TranslationKey } from '@/i18n/messages';
import { exportCsv, exportXlsx, type ExportRows, type ExportTarget } from '@/utils/export';
import { formatDate } from '@/utils/formatters';
import {
  DEFAULT_INVENTORY_REPORT_FILTERS, filterInventoryReportRows, summarizeInventoryReport,
  type InventoryReportFilters, type InventoryReportRow, type InventoryValuationStatus,
} from '@/utils/inventory/inventoryReport';

const valuationLabels: Record<InventoryValuationStatus, TranslationKey> = {
  FIFO: 'inventoryReport.fifo', ESTIMATED: 'inventoryReport.estimated',
  MASTER_PRICE: 'inventoryReport.masterPrice', UNVALUED: 'inventoryReport.unvalued', EMPTY: 'inventoryReport.emptyStock',
};
const valuationColors = { FIFO: 'green', ESTIMATED: 'gold', MASTER_PRICE: 'orange', UNVALUED: 'red', EMPTY: 'default' };
const stockLabels = { tersedia: 'stock.safeStock', menipis: 'stock.lowStock', habis: 'stock.outOfStock' } as const;
const stockColors = { tersedia: 'green', menipis: 'gold', habis: 'red' };

export default function InventoryReport() {
  const { t, locale } = useI18n();
  const { message } = App.useApp();
  const { baseCurrencySymbol, baseCurrencyCode } = useBaseCurrency();
  const { data, error, isLoading, refresh } = useInventoryReport();
  const [filters, setFilters] = useState<InventoryReportFilters>(DEFAULT_INVENTORY_REPORT_FILTERS);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const rows = useMemo(() => filterInventoryReportRows(data?.rows ?? [], filters), [data, filters]);
  const summary = useMemo(() => summarizeInventoryReport(rows), [rows]);
  const categoryOptions = useMemo(() => [...new Set(data?.rows.map((row) => row.category))]
    .sort().map((value) => ({ value, label: getProductCategoryLabel(value, t) })), [data, t]);
  const number = (value: number, digits = 6) => Number.isFinite(value)
    ? value.toLocaleString(locale === 'id' ? 'id-ID' : 'en-US', { maximumFractionDigits: digits }) : '—';
  const money = (value: number | null) => value === null ? '—' : `${baseCurrencySymbol} ${number(value, 2)}`;
  const changeFilters = (patch: Partial<InventoryReportFilters>) => {
    setFilters((current) => ({ ...current, ...patch }));
    setPage(1);
  };
  const stockOptions = [
    { value: 'IN_STOCK', label: t('inventoryReport.inStock') },
    { value: 'ALL', label: t('stock.allStock') },
    { value: 'LOW', label: t('stock.lowStock') },
    { value: 'OUT', label: t('stock.outOfStock') },
  ];
  const typeOptions = [
    { value: 'FINISHED_GOOD', label: t('stock.mobile.finishedGood') },
    { value: 'RAW_MATERIAL', label: t('stock.mobile.rawMaterial') },
  ];

  const handleExport = async (format: 'xlsx' | 'csv', target: ExportTarget) => {
    if (!data || error || !rows.length) return;
    const summaryRows: ExportRows = [
      [t('inventoryReport.title')],
      [t('inventoryReport.asOf', { date: formatDate(data.generatedAt) })],
      [t('documents.currency'), baseCurrencyCode],
      [t('stock.searchPlaceholder'), filters.search],
      [t('stock.category'), filters.category ? getProductCategoryLabel(filters.category, t) : t('common.all')],
      [t('inventoryReport.stockStatus'), stockOptions.find((option) => option.value === filters.stock)?.label],
      [t('inventoryReport.type'), typeOptions.find((option) => option.value === filters.productType)?.label ?? t('inventoryReport.allTypes')],
      [],
      [t('inventoryReport.products'), summary.productCount],
      [t(summary.unvaluedCount ? 'inventoryReport.partialValue' : 'inventoryReport.value'), summary.value],
      [t('inventoryReport.estimatedCount'), summary.estimatedCount],
      [t('inventoryReport.unvaluedCount'), summary.unvaluedCount],
      [t('inventoryReport.discrepancyCount'), summary.discrepancyCount],
      ...summary.quantities.map(({ unit, quantity }) => [t('inventoryReport.quantity'), quantity, unit]),
      [], [t('inventoryReport.method')], [t('inventoryReport.scope')],
      ...(summary.unvaluedCount ? [[t('inventoryReport.unvaluedNotice', { count: summary.unvaluedCount })]] : []),
    ];
    const detailRows: ExportRows = [
      [t('stock.productName'), 'SKU', t('stock.category'), t('inventoryReport.type'), t('product.stock'),
        t('inventoryReport.unit'), t('inventoryReport.stockStatus'), t('inventoryReport.unitCost'),
        t('inventoryReport.value'), t('inventoryReport.valuation'), t('inventoryReport.discrepancy')],
      ...rows.map((row) => [row.name, row.sku, getProductCategoryLabel(row.category, t),
        t(row.productType === 'RAW_MATERIAL' ? 'stock.mobile.rawMaterial' : 'stock.mobile.finishedGood'),
        row.stock, row.unit, t(stockLabels[row.stockStatus]), row.unitCost, row.value,
        t(valuationLabels[row.valuationStatus]), t(row.discrepancy ? 'common.yes' : 'common.no')]),
    ];
    try {
      const filename = `laporan-persediaan-${data.generatedAt.slice(0, 10)}`;
      const exported = format === 'xlsx'
        ? await exportXlsx({ filename: `${filename}.xlsx`, target, sheets: [
          { name: t('inventoryReport.summary'), rows: summaryRows },
          { name: t('inventoryReport.details'), rows: detailRows },
        ] })
        : await exportCsv({ filename: `${filename}.csv`, target, rows: [...summaryRows, [], ...detailRows] });
      if (exported) message.success(t('inventoryReport.exportSuccess'));
    } catch {
      message.error(t('inventoryReport.exportError'));
    }
  };

  const columns: ColumnsType<InventoryReportRow> = [
    { title: t('stock.productName'), key: 'name', width: 240, sorter: (a, b) => a.name.localeCompare(b.name),
      render: (_, row) => <><div className="font-medium">{row.name}</div><div className="text-xs text-gray-500">{row.sku || '—'}</div></> },
    { title: t('stock.category'), key: 'category', width: 150, render: (_, row) => getProductCategoryLabel(row.category, t) },
    { title: t('product.stock'), key: 'stock', width: 145, align: 'right', sorter: (a, b) => a.stock - b.stock,
      render: (_, row) => <><div>{number(row.stock)} {row.unit}</div><Tag className="!m-0" color={stockColors[row.stockStatus]}>{t(stockLabels[row.stockStatus])}</Tag></> },
    { title: t('inventoryReport.unitCost'), key: 'unitCost', width: 170, align: 'right',
      render: (_, row) => money(row.unitCost) },
    { title: `${t('inventoryReport.value')} (${baseCurrencyCode})`, key: 'value', width: 185, align: 'right',
      sorter: (a, b) => (a.value ?? -Infinity) - (b.value ?? -Infinity), render: (_, row) => <span className="font-semibold">{money(row.value)}</span> },
    { title: t('inventoryReport.valuation'), key: 'valuation', width: 215,
      render: (_, row) => <div className="space-y-1">
        <Tag color={valuationColors[row.valuationStatus]}>{t(valuationLabels[row.valuationStatus])}</Tag>
        {row.discrepancy && <div><Tooltip title={t('inventoryReport.lotQuantity', { quantity: number(row.lotQuantity), unit: row.unit })}>
          <Tag color="orange">{t('inventoryReport.discrepancy')}</Tag>
        </Tooltip></div>}
      </div> },
  ];

  return (
    <div className="min-w-0 space-y-5 p-4 sm:p-6" data-testid="inventory-report">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Typography.Title level={3} className="!mb-1">{t('inventoryReport.title')}</Typography.Title>
          <p className="text-sm text-gray-500">{t('inventoryReport.description')}</p>
          {data && <p className="mt-1 text-xs text-gray-500">{t('inventoryReport.asOf', { date: formatDate(data.generatedAt) })}</p>}
        </div>
        <div className="flex gap-2">
          <Button icon={<ReloadOutlined />} onClick={refresh} loading={isLoading}>{t('common.refresh')}</Button>
          <ExportActions disabled={isLoading || Boolean(error) || !rows.length} formats={[
            { key: 'xlsx', label: 'Excel', onExport: (target) => handleExport('xlsx', target) },
            { key: 'csv', label: 'CSV', onExport: (target) => handleExport('csv', target) },
          ]} />
        </div>
      </div>

      <Card size="small">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Input aria-label={t('stock.searchPlaceholder')} placeholder={t('stock.searchPlaceholder')} prefix={<SearchOutlined />} allowClear
            value={filters.search} onChange={(event) => changeFilters({ search: event.target.value })} />
          <Select aria-label={t('stock.categoryPlaceholder')} placeholder={t('stock.categoryPlaceholder')} allowClear
            value={filters.category} options={categoryOptions} onChange={(category) => changeFilters({ category })} />
          <Select aria-label={t('inventoryReport.stockStatus')} value={filters.stock} options={stockOptions}
            onChange={(stock: InventoryReportFilters['stock']) => changeFilters({ stock })} />
          <Select aria-label={t('inventoryReport.type')} placeholder={t('inventoryReport.allTypes')} allowClear
            value={filters.productType} options={typeOptions} onChange={(productType) => changeFilters({ productType })} />
        </div>
        <div className="mt-3 flex items-center justify-between gap-2">
          <Popover trigger="click" placement="bottomLeft" title={t('inventoryReport.info')} content={
            <div className="max-h-[60vh] w-96 max-w-[calc(100vw-4rem)] space-y-3 overflow-y-auto text-sm">
              <p>{t('inventoryReport.method')}</p>
              <p>{t('inventoryReport.scope')}</p>
              {summary.estimatedCount > 0 && <p>{t('inventoryReport.estimatedNotice', { count: summary.estimatedCount })}</p>}
              {summary.unvaluedCount > 0 && <p>{t('inventoryReport.unvaluedNotice', { count: summary.unvaluedCount })}</p>}
              {summary.discrepancyCount > 0 && <p>{t('inventoryReport.discrepancyNotice', { count: summary.discrepancyCount })}</p>}
            </div>
          }>
            <Button type="text" size="small" icon={<InfoCircleOutlined />} className="!text-gray-500">{t('inventoryReport.info')}</Button>
          </Popover>
          <Button onClick={() => { setFilters(DEFAULT_INVENTORY_REPORT_FILTERS); setPage(1); }}>{t('common.reset')}</Button>
        </div>
      </Card>

      {error ? <Alert type="error" showIcon title={t('inventoryReport.loadError')} description={error} /> : <>
        <div className="grid gap-3 md:grid-cols-3">
          <Card size="small" loading={isLoading}><p className="text-sm text-gray-500">{t('inventoryReport.products')}</p>
            <p className="mt-2 text-2xl font-semibold" data-testid="inventory-product-count">{number(summary.productCount, 0)}</p></Card>
          <Card size="small" loading={isLoading}><p className="text-sm text-gray-500">{t('inventoryReport.quantity')}</p>
            <div className="mt-2 flex flex-wrap gap-2" data-testid="inventory-quantities">
              {summary.quantities.length ? summary.quantities.map(({ unit, quantity }) => <Tag key={unit}>{number(quantity)} {unit}</Tag>) : '—'}
            </div></Card>
          <Card size="small" loading={isLoading}><p className="text-sm text-gray-500">{t(summary.unvaluedCount ? 'inventoryReport.partialValue' : 'inventoryReport.value')}</p>
            <p className="mt-2 break-words text-2xl font-semibold" data-testid="inventory-total-value">{money(summary.value)}</p></Card>
        </div>
        {(summary.estimatedCount > 0 || summary.unvaluedCount > 0 || summary.discrepancyCount > 0) && <Alert
          type={summary.unvaluedCount > 0 || summary.discrepancyCount > 0 ? 'warning' : 'info'} showIcon
          title={<div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {summary.estimatedCount > 0 && <span>{t('inventoryReport.estimatedSummary', { count: summary.estimatedCount })}</span>}
            {summary.unvaluedCount > 0 && <span>{t('inventoryReport.unvaluedSummary', { count: summary.unvaluedCount })}</span>}
            {summary.discrepancyCount > 0 && <span>{t('inventoryReport.discrepancySummary', { count: summary.discrepancyCount })}</span>}
          </div>} />}
        <Card size="small" className="min-w-0" styles={{ body: { padding: 0 } }}>
          <Table<InventoryReportRow> rowKey="id" columns={columns} dataSource={rows} loading={isLoading}
            scroll={{ x: 1105 }} size="small" locale={{ emptyText: <Empty description={t('inventoryReport.noData')} /> }}
            pagination={{ current: Math.min(page, Math.max(1, Math.ceil(rows.length / pageSize))), pageSize, showSizeChanger: true,
              onChange: (nextPage, nextSize) => { setPage(nextPage); setPageSize(nextSize); } }} />
        </Card>
      </>}
    </div>
  );
}
