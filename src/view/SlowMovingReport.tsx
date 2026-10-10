import { useMemo, useState } from 'react';
import { Alert, App, Button, Card, DatePicker, Empty, Input, InputNumber, Pagination, Popover, Select, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { InfoCircleOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import ExportActions from '@/components/ExportActions';
import { useI18n } from '@/hooks/useI18n';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useSlowMovingReport } from '@/hooks/useSlowMovingReport';
import { getProductCategoryLabel } from '@/i18n/stock';
import type { TranslationKey } from '@/i18n/messages';
import dayjs from '@/lib/dayjs';
import { DASHBOARD_PERIOD_PRESETS, getDashboardPeriodLabelKey, getDashboardPeriodRange, type DashboardPeriodPreset } from '@/utils/dashboardDateRanges';
import { exportCsv, type ExportRows, type ExportTarget } from '@/utils/export';
import { DEFAULT_SLOW_MOVING_FILTERS, filterSlowMovingRows, type SlowMovingFilters, type SlowMovingStatus } from '@/utils/inventory/slowMovingReport';

const statusLabels: Record<SlowMovingStatus, TranslationKey> = {
  NO_SALES: 'slowMoving.noSales', NO_NET_SALES: 'slowMoving.noNetSales', SLOW: 'slowMoving.slow',
  MOVING: 'slowMoving.moving', OUT_OF_STOCK: 'slowMoving.out', REVIEW: 'slowMoving.review',
};
const statusColors = { NO_SALES: 'red', NO_NET_SALES: 'red', SLOW: 'orange', MOVING: 'green', OUT_OF_STOCK: 'default', REVIEW: 'gold' };
type ReportRow = ReturnType<typeof filterSlowMovingRows>[number];

export default function SlowMovingReport() {
  const { t, locale } = useI18n();
  const isMobile = useIsMobile();
  const { message } = App.useApp();
  const [preset, setPreset] = useState<DashboardPeriodPreset>('this-month');
  const [range, setRange] = useState(() => getDashboardPeriodRange('this-month'));
  const [threshold, setThreshold] = useState(5);
  const [filters, setFilters] = useState<SlowMovingFilters>(DEFAULT_SLOW_MOVING_FILTERS);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const { data, error, isLoading, refresh } = useSlowMovingReport(range);
  const rows = useMemo(() => filterSlowMovingRows(data?.rows ?? [], filters, threshold), [data, filters, threshold]);
  const currentPage = Math.min(page, Math.max(1, Math.ceil(rows.length / pageSize)));
  const categories = useMemo(() => [...new Set(data?.rows.map((row) => row.category))].filter(Boolean).sort()
    .map((value) => ({ value, label: getProductCategoryLabel(value, t) })), [data, t]);
  const number = (value: number) => Number.isFinite(value) ? value.toLocaleString(locale === 'id' ? 'id-ID' : 'en-US', { maximumFractionDigits: 6 }) : '—';
  const quantity = (row: ReportRow, value: number) => row.needsReview ? '—' : `${number(value)} ${row.unit}`;
  const date = (value: string) => (value.length === 10 ? dayjs.tz(value) : dayjs(value).tz()).format('DD/MM/YYYY');
  const changeFilters = (patch: Partial<SlowMovingFilters>) => { setFilters((current) => ({ ...current, ...patch })); setPage(1); };
  const selectPreset = (next: DashboardPeriodPreset) => {
    setPreset(next);
    if (next !== 'custom') setRange(getDashboardPeriodRange(next));
    setPage(1);
  };
  const statusOptions = [
    { value: 'ATTENTION', label: t('slowMoving.attention') }, { value: 'ALL', label: t('common.all') },
    ...Object.entries(statusLabels).map(([value, label]) => ({ value, label: t(label) })),
  ];
  const stockOptions = [{ value: 'IN_STOCK', label: t('inventoryReport.inStock') }, { value: 'ALL', label: t('stock.allStock') }];
  const handleExport = async (target: ExportTarget) => {
    if (!data || error || isLoading || !rows.length) return;
    const exportedRows: ExportRows = [
      [t('slowMoving.title')], [t('slowMoving.start'), range.startDate], [t('slowMoving.end'), range.endDate],
      [t('slowMoving.threshold'), threshold], [t('stock.searchPlaceholder'), filters.search],
      [t('stock.category'), filters.category ? getProductCategoryLabel(filters.category, t) : t('common.all')],
      [t('slowMoving.status'), statusOptions.find((option) => option.value === filters.status)?.label],
      [t('inventoryReport.stockStatus'), stockOptions.find((option) => option.value === filters.stock)?.label],
      [t('slowMoving.scope')], [t('slowMoving.stockNote')],
      [t('slowMoving.rule', { threshold, days: data.days })], [],
      [t('stock.productName'), 'SKU', t('stock.category'), t('inventoryReport.unit'), t('slowMoving.stock'),
        t('slowMoving.sold'), t('slowMoving.returned'), t('slowMoving.net'), t('slowMoving.average'),
        t('slowMoving.saleCount'), t('slowMoving.lastSale'), t('slowMoving.status'), t('slowMoving.new')],
      ...rows.map((row) => [row.name, row.sku, getProductCategoryLabel(row.category, t), row.unit,
        Number.isFinite(row.stock) ? row.stock : null, row.needsReview ? null : row.sold,
        row.needsReview ? null : row.returned, row.needsReview ? null : row.netSold,
        row.needsReview ? null : row.dailyAverage, row.needsReview ? null : row.saleCount,
        row.lastSale ? date(row.lastSale) : '', t(statusLabels[row.status]), t(row.isNew ? 'common.yes' : 'common.no')]),
    ];
    try {
      if (await exportCsv({ filename: `slow-moving-${range.startDate}-${range.endDate}.csv`, rows: exportedRows, target })) {
        message.success(t('slowMoving.exportSuccess'));
      }
    } catch { message.error(t('slowMoving.exportError')); }
  };
  const columns: ColumnsType<ReportRow> = [
    { title: t('stock.productName'), key: 'name', width: 245, sorter: (a, b) => a.name.localeCompare(b.name),
      render: (_, row) => <><div className="font-medium">{row.name}</div><div className="text-xs text-gray-500">{row.sku || '—'} · {getProductCategoryLabel(row.category, t)}</div>
        {row.isNew && <Tag className="!mt-1">{t('slowMoving.new')}</Tag>}</> },
    { title: t('slowMoving.status'), key: 'status', width: 220, render: (_, row) => <Tag color={statusColors[row.status]}>{t(statusLabels[row.status])}</Tag> },
    { title: t('slowMoving.stock'), key: 'stock', width: 145, align: 'right', sorter: (a, b) => a.stock - b.stock, render: (_, row) => `${number(row.stock)} ${row.unit}` },
    { title: t('slowMoving.sold'), key: 'sold', width: 135, align: 'right', render: (_, row) => quantity(row, row.sold) },
    { title: t('slowMoving.returned'), key: 'returned', width: 135, align: 'right', render: (_, row) => quantity(row, row.returned) },
    { title: t('slowMoving.net'), key: 'net', width: 155, align: 'right', sorter: (a, b) => a.netSold - b.netSold,
      render: (_, row) => <span className="font-semibold">{quantity(row, row.netSold)}</span> },
    { title: t('slowMoving.average'), key: 'average', width: 165, align: 'right', render: (_, row) => quantity(row, row.dailyAverage) },
    { title: t('slowMoving.saleCount'), key: 'count', width: 135, align: 'right', render: (_, row) => row.needsReview ? '—' : number(row.saleCount) },
    { title: t('slowMoving.lastSale'), key: 'lastSale', width: 190, render: (_, row) => row.lastSale ? date(row.lastSale) : t('slowMoving.noSaleDate') },
  ];

  return <div className="min-w-0 space-y-5 p-4 sm:p-6" data-testid="slow-moving-report">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><Typography.Title level={3} className="!mb-1">{t('slowMoving.title')}</Typography.Title>
        <p className="text-sm text-gray-500">{t('slowMoving.description')}</p>
        {data && <p className="mt-1 text-xs text-gray-500" data-testid="slow-moving-range">{t('slowMoving.range', { start: date(range.startDate), end: date(range.endDate), days: data.days })}</p>}
      </div>
      <div className="flex gap-2"><Button icon={<ReloadOutlined />} loading={isLoading} onClick={() => {
        if (preset !== 'custom') setRange(getDashboardPeriodRange(preset));
        refresh();
      }}>{t('common.refresh')}</Button>
        <ExportActions disabled={isLoading || Boolean(error) || !rows.length} formats={[{ key: 'csv', label: 'CSV', onExport: handleExport }]} />
      </div>
    </div>
    <Card size="small">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div><label className="mb-1 block text-xs text-gray-500" htmlFor="slow-period">{t('slowMoving.period')}</label>
          <Select id="slow-period" className="w-full" value={preset} onChange={selectPreset}
            options={DASHBOARD_PERIOD_PRESETS.map((value) => ({ value, label: t(getDashboardPeriodLabelKey(value)) }))} /></div>
        <div><label className="mb-1 block text-xs text-gray-500" htmlFor="slow-start">{t('slowMoving.start')}</label>
          <DatePicker id="slow-start" className="w-full" allowClear={false} format="DD/MM/YYYY" value={dayjs(range.startDate)}
            maxDate={dayjs(range.endDate)} onChange={(value) => { if (value) { setRange({ ...range, startDate: value.format('YYYY-MM-DD') }); setPreset('custom'); setPage(1); } }} /></div>
        <div><label className="mb-1 block text-xs text-gray-500" htmlFor="slow-end">{t('slowMoving.end')}</label>
          <DatePicker id="slow-end" className="w-full" allowClear={false} format="DD/MM/YYYY" value={dayjs(range.endDate)} minDate={dayjs(range.startDate)} maxDate={dayjs.tz()}
            onChange={(value) => { if (value) { setRange({ ...range, endDate: value.format('YYYY-MM-DD') }); setPreset('custom'); setPage(1); } }} /></div>
        <div><label className="mb-1 block text-xs text-gray-500" htmlFor="slow-threshold">{t('slowMoving.threshold')}</label>
          <InputNumber id="slow-threshold" aria-describedby="slow-threshold-hint" className="!w-full" value={threshold} min={0} onChange={(value) => {
            if (value !== null && Number.isFinite(value) && value >= 0) { setThreshold(value); setPage(1); }
          }} />
          <p id="slow-threshold-hint" className="mt-1 text-xs text-gray-500">{t('slowMoving.thresholdHint')}</p></div>
        <Input aria-label={t('stock.searchPlaceholder')} placeholder={t('stock.searchPlaceholder')} prefix={<SearchOutlined />} allowClear
          value={filters.search} onChange={(event) => changeFilters({ search: event.target.value })} />
        <Select aria-label={t('stock.categoryPlaceholder')} placeholder={t('stock.categoryPlaceholder')} allowClear value={filters.category}
          options={categories} onChange={(category) => changeFilters({ category })} />
        <Select aria-label={t('slowMoving.status')} value={filters.status} options={statusOptions} onChange={(status: SlowMovingFilters['status']) => {
          changeFilters(status === 'OUT_OF_STOCK' ? { status, stock: 'ALL' } : { status });
        }} />
        <Select aria-label={t('inventoryReport.stockStatus')} value={filters.stock} options={stockOptions} onChange={(stock: SlowMovingFilters['stock']) => changeFilters({ stock })} />
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <Popover trigger="click" placement="bottomLeft" title={t('slowMoving.info')} content={
          <div className="max-h-[60vh] w-96 max-w-[calc(100vw-4rem)] space-y-3 overflow-y-auto text-sm">
            <p>{t('slowMoving.rule', { threshold: number(threshold), days: data?.days ?? '…' })}</p>
            <p>{t('slowMoving.scope')}</p>
            <p>{t('slowMoving.stockNote')}</p>
            <p>{t('slowMoving.filtered')}</p>
          </div>
        }>
          <Button type="text" size="small" icon={<InfoCircleOutlined />} className="!text-gray-500">{t('slowMoving.info')}</Button>
        </Popover>
        <Button onClick={() => { setFilters(DEFAULT_SLOW_MOVING_FILTERS); setThreshold(5); selectPreset('this-month'); }}>{t('common.reset')}</Button></div>
    </Card>
    {error ? <Alert type="error" showIcon title={t('slowMoving.loadError')} description={error} /> : <>
      <div className="grid gap-3 sm:grid-cols-3">
        {([
          ['slowMoving.products', rows.length, 'slow-moving-count'],
          ['slowMoving.zeroProducts', rows.filter((row) => !row.needsReview && row.netSold <= 0).length, 'slow-moving-zero'],
          ['slowMoving.slowProducts', rows.filter((row) => row.status === 'SLOW').length, 'slow-moving-slow'],
        ] as const).map(([label, count, testId]) => <Card size="small" key={label} loading={isLoading}><p className="text-sm text-gray-500">{t(label)}</p>
          <p className="mt-2 text-2xl font-semibold" data-testid={testId}>{number(count)}</p></Card>)}
      </div>
      {rows.some((row) => row.needsReview) && <Alert type="warning" showIcon title={t('slowMoving.reviewNote')} />}
      {isMobile ? <div className="space-y-3">
        {isLoading ? <Card loading /> : rows.length ? <>
          {rows.slice((currentPage - 1) * pageSize, currentPage * pageSize).map((row) => <Card size="small" key={row.id} data-testid={`slow-moving-product-${row.id}`}>
            <div className="break-words font-semibold">{row.name}</div>
            <div className="mb-2 break-words text-xs text-gray-500">{row.sku || '—'} · {getProductCategoryLabel(row.category, t)}</div>
            <div className="flex flex-wrap gap-1"><Tag color={statusColors[row.status]}>{t(statusLabels[row.status])}</Tag>
              {row.isNew && <Tag>{t('slowMoving.new')}</Tag>}</div>
            <dl className="mt-3 grid grid-cols-2 gap-3">
              {([
                ['slowMoving.stock', `${number(row.stock)} ${row.unit}`], ['slowMoving.net', quantity(row, row.netSold)],
                ['slowMoving.sold', quantity(row, row.sold)], ['slowMoving.returned', quantity(row, row.returned)],
                ['slowMoving.average', quantity(row, row.dailyAverage)], ['slowMoving.saleCount', row.needsReview ? '—' : number(row.saleCount)],
              ] as const).map(([label, value]) => <div key={label} className="min-w-0">
                <dt className="text-xs text-gray-500">{t(label)}</dt><dd className="mt-1 break-words font-medium">{value}</dd>
              </div>)}
            </dl>
            <p className="mt-3 text-xs text-gray-500">{t('slowMoving.lastSale')}: {row.lastSale ? date(row.lastSale) : '—'}</p>
          </Card>)}
          <Pagination simple current={currentPage} pageSize={pageSize} total={rows.length} onChange={setPage} />
        </> : <Card size="small"><Empty description={t('slowMoving.noData')} /></Card>}
      </div> : <Card size="small" className="min-w-0" styles={{ body: { padding: 0 } }}>
        <Table<ReportRow> rowKey="id" columns={columns} dataSource={rows} loading={isLoading} size="small" scroll={{ x: 1525 }}
          locale={{ emptyText: <Empty description={t('slowMoving.noData')} /> }} pagination={{ current: currentPage, pageSize, showSizeChanger: true,
            onChange: (nextPage, nextSize) => { setPage(nextPage); setPageSize(nextSize); } }} />
      </Card>}
    </>}
  </div>;
}
