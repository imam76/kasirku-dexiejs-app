import { usePosSalesReport } from '@/hooks/useReports';
import { useI18n } from '@/hooks/useI18n';
import { useAuth } from '@/auth/useAuth';
import { getProductCategoryLabel, getProductCategoryOptions } from '@/i18n/stock';
import dayjs from '@/lib/dayjs';
import { db } from '@/lib/db';
import { exportCsv, exportPdf, type ExportTarget } from '@/utils/export';
import { formatCurrency } from '@/utils/formatters';
import { formatWeightTotal, resolveTransactionItemUnit } from '@/utils/salesUnits';
import { BarChartOutlined, FilePdfOutlined, FileTextOutlined, ReloadOutlined, ShoppingCartOutlined } from '@ant-design/icons';
import { App, Button, Card, DatePicker, Empty, Select, Statistic, Typography } from 'antd';
import autoTable from 'jspdf-autotable';
import { useState } from 'react';
import ExportActions from '@/components/ExportActions';
import { useIsMobile } from '@/hooks/useIsMobile';
import { Loading } from '../components/Loading';
import DesktopSalesTable from './pos-sales-report/DesktopSalesTable';
import MobileSalesList from './pos-sales-report/MobileSalesList';
import TopProductsTable from './pos-sales-report/TopProductsTable';

const { Title, Text } = Typography;

export default function PosSalesReport() {
  const { message } = App.useApp();
  const { t } = useI18n();
  const { can } = useAuth();
  const canViewProfit = can('PROFIT_VIEW');
  const isMobile = useIsMobile();
  const [startDate, setStartDate] = useState<string | undefined>(dayjs.tz().format('YYYY-MM-DD'));
  const [endDate, setEndDate] = useState<string | undefined>(dayjs.tz().format('YYYY-MM-DD'));
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>([
    dayjs.tz().startOf('day'),
    dayjs.tz().endOf('day'),
  ]);
  const [selectedHelper, setSelectedHelper] = useState<string | undefined>('today');

  // New Filter States
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string | undefined>('SEMUA');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const categoryOptions = getProductCategoryOptions(t);

  const { data, isLoading, error, refetch } = usePosSalesReport(startDate, endDate, selectedPaymentMethod, selectedCategories);

  const handleExportPDF = async (target: ExportTarget = 'auto') => {
    if (!data) return;

    try {
      const exported = await exportPdf({
        filename: `laporan-penjualan-pos-${dayjs().tz().format('YYYY-MM-DD')}.pdf`,
        target,
        build: (doc) => {
          const period = `${t('report.period')} ${startDate || t('report.allPeriod')} s/d ${endDate || t('report.allPeriod')}`;
          const printDate = `${t('report.printDate')} ${dayjs().tz().format('YYYY-MM-DD HH:mm:ss')}`;

          doc.setFontSize(16);
          doc.setFont('helvetica', 'bold');
          doc.text('Kasirku', 105, 18, { align: 'center' });
          doc.setFontSize(13);
          doc.text(t('report.posSales.title'), 105, 30, { align: 'center' });
          doc.setFontSize(11);
          doc.setFont('helvetica', 'normal');
          doc.text(period, 105, 41, { align: 'center' });
          doc.setFontSize(9);
          doc.text(printDate, 105, 49, { align: 'center' });

          const tableData = data.transactions.map((t, index) => {
            const balance = Math.max(t.total_amount - (t.payment_amount || 0), 0);
            const discount = t.discount_amount ?? 0;
            const subtotal = t.subtotal_amount ?? t.total_amount + discount;

            return [
              dayjs(t.created_at).tz().format('DD/MM/YYYY'),
              t.transaction_number || String(index + 1),
              '-',
              formatCurrency(subtotal),
              formatCurrency(discount),
              formatCurrency(t.total_amount),
              formatCurrency(t.payment_amount || 0),
              formatCurrency(balance),
            ];
          });

          autoTable(doc, {
            startY: 58,
            head: [[t('report.date'), t('report.orderNo'), t('report.buyer'), t('report.subtotal'), t('report.discount'), t('report.salesTotal'), t('report.payment'), t('report.balance')]],
            body: tableData,
            foot: [[
              '',
              '',
              t('common.total'),
              formatCurrency(data.totalRevenue + data.totalDiscount),
              formatCurrency(data.totalDiscount),
              formatCurrency(data.totalRevenue),
              formatCurrency(data.transactions.reduce((sum, t) => sum + (t.payment_amount || 0), 0)),
              formatCurrency(data.transactions.reduce((sum, t) => sum + Math.max(t.total_amount - (t.payment_amount || 0), 0), 0)),
            ]],
            theme: 'grid',
            styles: { fontSize: 8, cellPadding: 2, overflow: 'linebreak' },
            headStyles: { fillColor: [199, 210, 254], textColor: 33, fontStyle: 'normal' },
            footStyles: { fillColor: [241, 245, 249], textColor: 15, fontStyle: 'bold' },
            columnStyles: {
              0: { cellWidth: 18 },
              1: { cellWidth: 24 },
              2: { cellWidth: 24 },
              3: { halign: 'right', cellWidth: 24 },
              4: { halign: 'right', cellWidth: 20 },
              5: { halign: 'right', cellWidth: 28 },
              6: { halign: 'right', cellWidth: 26 },
              7: { halign: 'right', cellWidth: 20 },
            },
            margin: { left: 8, right: 8 },
          });
        },
      });

      if (!exported) return;
      message.success(t('report.posSales.exportPdfSuccess'));
    } catch (error) {
      console.error('Failed to export POS sales PDF:', error);
      message.error(t('report.posSales.exportPdfFailed'));
    }
  };

  const handleDownload = async (target: ExportTarget = 'auto') => {
    if (!data) return;

    try {
      const transactionIds = data.transactions.map(t => t.id);
      const allItems = await db.transactionItems
        .where('transaction_id')
        .anyOf(transactionIds)
        .toArray();

      const products = await db.products.toArray();
      const productMap = new Map(products.map(p => [p.id, p]));

      const itemDetailHeader = [
        t('report.transactionNo'),
        t('report.date'),
        t('report.productName'),
        t('report.category'),
        t('report.amount'),
        t('report.unit'),
        t('report.unitPrice'),
        t('report.discount'),
        t('report.subtotal'),
        ...(canViewProfit ? [t('report.hpp'), t('report.profit')] : []),
      ];
      const summaryRows = [
        [t('report.totalTransactions'), data.transactions.length],
        [t('report.discount'), data.totalDiscount],
        [t('report.salesTotal'), data.totalRevenue],
        ...(canViewProfit ? [[t('report.profit'), data.totalProfit]] : []),
        [t('report.unitItemsSold'), data.soldItems.unitItems],
        [t('report.weightedItemsSold'), data.soldItems.weightedLineItems],
        [t('report.totalWeightedBase'), formatWeightTotal(data.soldItems.totalWeightBase)],
        [t('report.totalWeightedGram'), data.soldItems.totalWeightBase],
        [t('report.averageTransaction'), data.averageTransaction],
      ];
      const csvRows = [
        ['SECTION 1: TRANSACTION SUMMARY'],
        [t('report.transactionNo'), t('report.date'), t('report.paymentMethod'), t('cart.subtotal'), t('report.discount'), t('report.salesTotal'), t('report.payment'), t('report.change')],
        ...data.transactions.map((t) => [
          t.transaction_number,
          dayjs(t.created_at).tz().format('YYYY-MM-DD HH:mm:ss'),
          t.payment_method || 'TUNAI',
          t.subtotal_amount ?? t.total_amount + (t.discount_amount ?? 0),
          t.discount_amount ?? 0,
          t.total_amount,
          t.payment_amount,
          t.change_amount,
        ]),
        [],
        ['SECTION 2: TRANSACTION ITEM DETAILS'],
        itemDetailHeader,
        ...allItems.map((item) => {
          const trans = data.transactions.find(t => t.id === item.transaction_id);
          const product = productMap.get(item.product_id);
          const unit = resolveTransactionItemUnit(item, product);
          return [
            trans?.transaction_number || '-',
            dayjs(item.created_at).tz().format('YYYY-MM-DD HH:mm:ss'),
            item.product_name,
            getProductCategoryLabel(product?.category || 'non_consumable', t),
            item.quantity,
            unit,
            item.price,
            item.discount_amount ?? 0,
            item.subtotal,
            ...(canViewProfit ? [item.purchase_price, item.profit] : []),
          ];
        }),
        [],
        [t('report.summary')],
        ...summaryRows,
      ];

      const exported = await exportCsv({
        filename: `laporan-penjualan-pos-${dayjs().tz().format('YYYY-MM-DD')}.csv`,
        rows: csvRows,
        target,
      });
      if (!exported) return;
      message.success(t('report.posSales.exportSuccess'));
    } catch (error) {
      console.error('Failed to export POS sales report:', error);
      message.error(t('report.posSales.exportFailed'));
    }
  };

  const handleDateRangeChange = (dates: [dayjs.Dayjs | null, dayjs.Dayjs | null] | null) => {
    setDateRange(dates);
    if (selectedHelper !== 'custom') {
      setSelectedHelper('custom');
    }
    if (dates && dates[0] && dates[1]) {
      setStartDate(dates[0].format('YYYY-MM-DD'));
      setEndDate(dates[1].format('YYYY-MM-DD'));
    } else {
      setStartDate(undefined);
      setEndDate(undefined);
    }
  };

  const handleHelperChange = (value: string) => {
    setSelectedHelper(value);
    let range: [dayjs.Dayjs, dayjs.Dayjs] | null = null;

    switch (value) {
      case 'today':
        range = [dayjs.tz().startOf('day'), dayjs.tz().endOf('day')];
        break;
      case 'yesterday':
        range = [dayjs.tz().subtract(1, 'day').startOf('day'), dayjs.tz().subtract(1, 'day').endOf('day')];
        break;
      case 'this-week':
        range = [dayjs.tz().startOf('week').add(1, 'day'), dayjs.tz().endOf('day')];
        break;
      case 'this-month':
        range = [dayjs.tz().startOf('month'), dayjs.tz().endOf('day')];
        break;
      case 'last-month':
        range = [dayjs.tz().subtract(1, 'month').startOf('month'), dayjs.tz().subtract(1, 'month').endOf('month')];
        break;
      case 'custom':
        return;
      default:
        range = null;
    }

    if (range) {
      setDateRange(range);
      setStartDate(range[0].format('YYYY-MM-DD'));
      setEndDate(range[1].format('YYYY-MM-DD'));
    } else {
      setDateRange(null);
      setStartDate(undefined);
      setEndDate(undefined);
    }
  };

  const handleReset = () => {
    const todayRange: [dayjs.Dayjs, dayjs.Dayjs] = [dayjs.tz().startOf('day'), dayjs.tz().endOf('day')];
    setDateRange(todayRange);
    setStartDate(todayRange[0].format('YYYY-MM-DD'));
    setEndDate(todayRange[1].format('YYYY-MM-DD'));
    setSelectedHelper('today');
    setSelectedPaymentMethod('SEMUA');
    setSelectedCategories([]);
  };

  if (isLoading) {
    return <Loading />;
  }

  if (error) {
    return (
      <div className="p-6">
        <Empty
          description={t('report.withDateError', { message: error instanceof Error ? error.message : t('common.unknownError') })}
        />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 bg-[#FDFDFD] min-h-screen">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <div>
          <Title level={4} className="!mb-1 !font-bold text-gray-900">{t('report.posSales.title')}</Title>
          <p className="text-gray-500 text-xs sm:text-sm">{t('report.posSales.subtitle')}</p>
        </div>
        <div className="flex flex-wrap gap-2 w-full sm:w-auto">
          <Button
            className="flex-1 sm:flex-none flex items-center justify-center gap-1.5"
            icon={<ReloadOutlined className="text-[12px]" />}
            onClick={() => refetch()}
            loading={isLoading}
          >
            {t('common.refresh')}
          </Button>
          <ExportActions
            buttonClassName="flex-1 sm:flex-none flex items-center justify-center gap-1.5 bg-[#2563EB] hover:bg-[#1D4ED8] border-none shadow-sm"
            disabled={!data || data.transactions.length === 0}
            formats={[
              {
                key: 'csv',
                label: 'CSV',
                icon: <FileTextOutlined className="text-[12px]" />,
                onExport: handleDownload,
              },
              {
                key: 'pdf',
                label: 'PDF',
                icon: <FilePdfOutlined className="text-[12px]" />,
                onExport: handleExportPDF,
              },
            ]}
          />
        </div>
      </div>

      {/* FILTER SECTION */}
      <div className="mb-8 bg-white p-5 rounded-xl border border-gray-100 shadow-sm">
        <div className="text-[11px] font-bold text-gray-400 tracking-[0.1em] mb-4 uppercase">{t('report.parameterTitle')}</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-5">
            <div className="flex flex-col gap-1.5">
              <span className="text-[13px] font-medium text-gray-700 ml-0.5">{t('report.productCategoryBreakdown')}</span>
              <Select
                mode="multiple"
                placeholder={t('report.allCategories')}
                className="w-full"
                value={selectedCategories}
                onChange={setSelectedCategories}
                allowClear
                options={categoryOptions}
                size="large"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-[13px] font-medium text-gray-700 ml-0.5">{t('report.paymentMethod')}</span>
              <Select
                placeholder={t('report.allMethods')}
                className="w-full"
                value={selectedPaymentMethod}
                onChange={setSelectedPaymentMethod}
                options={[
                  { value: 'SEMUA', label: t('report.allMethods') },
                  { value: 'TUNAI', label: t('payment.cash') },
                  { value: 'NON_TUNAI', label: t('payment.nonCash') },
                ]}
                size="large"
              />
            </div>
          </div>

          <div className="flex flex-col gap-2.5">
            <span className="text-[13px] font-medium text-gray-700 ml-0.5">{t('report.dateRange')}</span>
            <div className="flex flex-wrap gap-2">
              {[
                { key: 'today', label: t('report.today') },
                { key: 'yesterday', label: t('report.yesterday') },
                { key: 'this-week', label: t('report.thisWeek') },
                { key: 'this-month', label: t('report.thisMonth') },
                { key: 'last-month', label: t('report.lastMonth') },
                { key: 'custom', label: t('report.custom') },
              ].map((helper) => (
                <Button
                  key={helper.key}
                  size={isMobile ? 'small' : 'middle'}
                  className={`rounded-full px-4 text-[12px] font-medium transition-all ${selectedHelper === helper.key ? 'bg-[#2563EB] text-white border-[#2563EB]' : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-[#2563EB]'}`}
                  onClick={() => handleHelperChange(helper.key)}
                >
                  {helper.label}
                </Button>
              ))}

              {(selectedCategories.length > 0 || selectedHelper !== 'today' || selectedPaymentMethod !== 'SEMUA') && (
                <Button type="link" onClick={handleReset} className="text-gray-400 hover:text-red-500 flex items-center gap-1">
                  <ReloadOutlined className="text-[10px]" /> {t('common.resetAll')}
                </Button>
              )}
            </div>

            {selectedHelper === 'custom' && (
              <div className="mt-2 animate-in fade-in slide-in-from-top-1 duration-300">
                <DatePicker.RangePicker
                  value={dateRange}
                  onChange={handleDateRangeChange}
                  format="YYYY-MM-DD"
                  placeholder={[t('common.from'), t('common.to')]}
                  className="w-full sm:w-[320px] rounded-lg"
                  size="large"
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* SUMMARY STATISTICS */}
      {data && data.transactions.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-8">
          {[
            { title: t('report.totalTransactions'), value: data.transactions.length, suffix: t('report.transaction'), color: '#1890ff', border: 'border-l-blue-500' },
            { title: t('report.salesTotal'), value: data.totalRevenue, prefix: 'Rp ', color: '#52c41a', border: 'border-l-green-500', isCurrency: true },
            ...(canViewProfit ? [{ title: t('report.profit'), value: data.totalProfit, prefix: 'Rp ', color: '#faad14', border: 'border-l-orange-500', isCurrency: true }] : []),
            { title: t('report.unitItemsSold'), value: data.soldItems.unitItems, suffix: t('report.unitSuffix'), color: '#722ed1', border: 'border-l-purple-500' },
            { title: t('report.weightedItemsSold'), value: data.soldItems.weightedLineItems, suffix: `${t('report.itemSuffix')} / ${formatWeightTotal(data.soldItems.totalWeightBase)}`, color: '#0f766e', border: 'border-l-teal-500' },
            { title: t('report.averageTransaction'), value: data.averageTransaction, prefix: 'Rp ', color: '#eb2f96', border: 'border-l-pink-500', isCurrency: true },
          ].map((stat, idx) => (
            <Card key={idx} className={`shadow-sm border-none border-l-4 ${stat.border} rounded-xl overflow-hidden`}>
              <Statistic
                title={<Text type="secondary" className="text-[11px] uppercase font-bold tracking-wider">{stat.title}</Text>}
                value={stat.value}
                prefix={stat.prefix}
                suffix={stat.suffix}
                precision={stat.isCurrency ? 2 : 0}
                valueStyle={{ color: stat.color, fontWeight: 'bold', fontSize: isMobile ? '16px' : '20px' }}
              />
            </Card>
          ))}
        </div>
      )}

      {/* TOP PRODUCTS SECTION */}
      {data && data.topProducts.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-4 ml-1">
            <BarChartOutlined className="text-orange-500" />
            <div className="text-[11px] font-bold text-gray-400 tracking-[0.1em] uppercase">{t('report.topProducts')}</div>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <TopProductsTable products={data.topProducts} canViewProfit={canViewProfit} />
          </div>
        </div>
      )}

      {/* DATA SECTION */}
      <div>
        <div className="flex items-center gap-2 mb-4 ml-1">
          <ShoppingCartOutlined className="text-blue-500" />
          <div className="text-[11px] font-bold text-gray-400 tracking-[0.1em] uppercase">{t('report.transactionList')}</div>
        </div>

        {isMobile ? (
          <MobileSalesList
            transactions={data?.transactions || []}
            totalRevenue={data?.totalRevenue || 0}
            totalDiscount={data?.totalDiscount || 0}
          />
        ) : (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <DesktopSalesTable
              transactions={data?.transactions || []}
              totalRevenue={data?.totalRevenue || 0}
              totalDiscount={data?.totalDiscount || 0}
            />
          </div>
        )}
      </div>

      {data && data.transactions.length === 0 && !isLoading && (
        <div className="bg-white py-16 rounded-xl border border-gray-100 shadow-sm text-center">
          <p className="text-gray-400 italic">{t('report.noDataForFilter')}</p>
        </div>
      )}
    </div>
  );
}
