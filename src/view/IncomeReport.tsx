import { FileExcelOutlined, FilePdfOutlined, FileTextOutlined, ReloadOutlined } from '@ant-design/icons';
import { App, Button, DatePicker, Select, Typography } from 'antd';
import { useRef, useState } from 'react';
import ExportActions from '@/components/ExportActions';
import { Loading } from '@/components/Loading';
import { FINANCE_CATEGORIES } from '@/constants/finance';
import { useCompanyProfileSetting } from '@/hooks/useCompanyProfileSetting';
import { useI18n } from '@/hooks/useI18n';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useIncomeReport } from '@/hooks/useReports';
import { getFinanceCategoryLabel } from '@/i18n/finance';
import dayjs from '@/lib/dayjs';
import { exportHtmlPdf, exportXlsx, saveExportFile, type ExportTarget } from '@/utils/export';
import IncomeReportDocument from './income-report/IncomeReportDocument';

const { Title } = Typography;

export default function IncomeReport() {
  const { message } = App.useApp();
  const { t, locale } = useI18n();
  const isMobile = useIsMobile();
  const { profile } = useCompanyProfileSetting();
  const reportRef = useRef<HTMLDivElement | null>(null);
  const [startDate, setStartDate] = useState<string | undefined>(dayjs.tz().format('YYYY-MM-DD'));
  const [endDate, setEndDate] = useState<string | undefined>(dayjs.tz().format('YYYY-MM-DD'));
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>([
    dayjs.tz().startOf('day'),
    dayjs.tz().endOf('day'),
  ]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedHelper, setSelectedHelper] = useState<string | undefined>('today');

  const { data, isLoading, refetch } = useIncomeReport(startDate, endDate, selectedCategories);
  const incomeCategories = [
    { value: FINANCE_CATEGORIES.SALES, label: t('finance.category.PENJUALAN') },
    { value: FINANCE_CATEGORIES.SALES_INVOICE_PAYMENT, label: t('finance.category.PEMBAYARAN_INVOICE_PENJUALAN') },
    { value: FINANCE_CATEGORIES.KSP_SAVING_DEPOSIT, label: t('finance.category.KSP_SETORAN_SIMPANAN') },
    { value: FINANCE_CATEGORIES.KSP_LOAN_PAYMENT, label: t('finance.category.KSP_PEMBAYARAN_ANGSURAN') },
    { value: FINANCE_CATEGORIES.KSP_LOAN_ADMIN_FEE, label: t('finance.category.KSP_ADMIN_PINJAMAN') },
    { value: FINANCE_CATEGORIES.SERVICE, label: t('finance.category.LAYANAN') },
    { value: FINANCE_CATEGORIES.BONUS_GRANT, label: t('finance.category.BONUS') },
    { value: FINANCE_CATEGORIES.OTHER, label: t('finance.category.LAINNYA') },
  ];
  const periodText = `${startDate || t('report.allPeriod')} s/d ${endDate || t('report.allPeriod')}`;
  const printDateText = dayjs().tz().format('YYYY-MM-DD HH:mm:ss');
  const selectedCategoryText = selectedCategories.length
    ? selectedCategories.map((category) => getFinanceCategoryLabel(category, t)).join(', ')
    : t('report.allCategories');
  const companyName = profile?.company_name || 'Frayukti';
  const exportFilenameBase = `laporan-pemasukan-${dayjs().tz().format('YYYY-MM-DD')}`;

  const escapeHtml = (value: string) =>
    value.replace(/[&<>"']/g, (char) => {
      const entities: Record<string, string> = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      };
      return entities[char] ?? char;
    });

  const buildHtmlDocument = () => `<!doctype html>
<html lang="${locale}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(t('report.income.title'))}</title>
  <style>
    @page { size: A4 portrait; margin: 12mm; }
    * { box-sizing: border-box; }
    body { margin: 0; background: #f3f4f6; color: #111827; font-family: Arial, sans-serif; padding: 24px; }
    .report-shell { margin: 0 auto; max-width: 960px; }
    @media print {
      body { background: #fff; padding: 0; }
    }
  </style>
</head>
<body>
  <main class="report-shell">${reportRef.current?.outerHTML ?? ''}</main>
</body>
</html>`;

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
    setSelectedCategories([]);
  };

  const handleExportPDF = async (target: ExportTarget = 'auto') => {
    if (!data || !reportRef.current) return;

    try {
      const exported = await exportHtmlPdf({
        filename: `${exportFilenameBase}.pdf`,
        element: reportRef.current,
        orientation: 'portrait',
        target,
      });
      if (exported) message.success(t('report.income.exportPdfSuccess'));
    } catch (error) {
      console.error('Failed to export income PDF:', error);
      message.error(t('report.income.exportPdfFailed'));
    }
  };

  const handleExportHtml = async (target: ExportTarget = 'auto') => {
    if (!data || !reportRef.current) return;

    try {
      const exported = await saveExportFile({
        filename: `${exportFilenameBase}.html`,
        mimeType: 'text/html',
        content: buildHtmlDocument(),
        target,
      });
      if (exported) message.success(t('report.income.exportHtmlSuccess'));
    } catch (error) {
      console.error('Failed to export income HTML:', error);
      message.error(t('report.income.exportHtmlFailed'));
    }
  };

  const handleExportExcel = async (target: ExportTarget = 'auto') => {
    if (!data) return;

    try {
      const header = [
        [companyName],
        [t('report.income.title')],
        [`${t('report.periodWithColon')} ${periodText}`],
        [`${t('report.incomeCategory')}: ${selectedCategoryText}`],
        [`${t('report.printDate')} ${printDateText}`],
        [],
        [t('report.dateTime'), t('report.descriptionLong'), t('report.category'), t('report.amount')],
      ];

      const body = data.transactions.map((transaction) => [
        dayjs(transaction.created_at).tz().format('YYYY-MM-DD HH:mm'),
        transaction.description || '-',
        getFinanceCategoryLabel(transaction.category, t),
        transaction.amount,
      ]);

      const footer = [
        [],
        ['', '', t('report.totalOverall'), data.totalIncome],
      ];

      await exportXlsx({
        filename: `${exportFilenameBase}.xlsx`,
        target,
        sheets: [
          {
            name: t('report.income.title'),
            rows: [...header, ...body, ...footer],
          },
        ],
      });
      message.success(t('report.income.exportExcelSuccess'));
    } catch (error) {
      console.error('Failed to export income Excel:', error);
      message.error(t('report.income.exportExcelFailed'));
    }
  };

  if (isLoading) return <Loading />;

  return (
    <div className="min-h-screen bg-[#FDFDFD] p-4 sm:p-6">
      <div className="mb-8 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <Title level={4} className="!mb-1 !font-bold text-gray-900">{t('report.income.title')}</Title>
          <p className="text-xs text-gray-500 sm:text-sm">{t('report.income.subtitle')}</p>
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <Button
            className="flex flex-1 items-center justify-center gap-1.5 sm:flex-none"
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
                key: 'pdf',
                label: 'PDF',
                icon: <FilePdfOutlined className="text-[12px]" />,
                onExport: handleExportPDF,
              },
              {
                key: 'html',
                label: 'HTML',
                icon: <FileTextOutlined className="text-[12px]" />,
                onExport: handleExportHtml,
              },
              {
                key: 'excel',
                label: 'Excel',
                icon: <FileExcelOutlined className="text-[12px]" />,
                onExport: handleExportExcel,
              },
            ]}
          />
        </div>
      </div>

      <div className="mb-8 rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
        <div className="mb-4 text-[11px] font-bold uppercase tracking-[0.1em] text-gray-400">{t('report.parameterTitle')}</div>
        <div className="space-y-5">
          <div className="flex flex-col gap-1.5">
            <span className="ml-0.5 text-[13px] font-medium text-gray-700">{t('report.incomeCategory')}</span>
            <Select
              mode="multiple"
              placeholder={t('report.allCategories')}
              className="w-full"
              value={selectedCategories}
              onChange={setSelectedCategories}
              allowClear
              options={incomeCategories}
              size="large"
            />
          </div>

          <div className="flex flex-col gap-2.5">
            <span className="ml-0.5 text-[13px] font-medium text-gray-700">{t('report.dateRange')}</span>
            <div className="flex flex-wrap gap-2">
              <Button
                size={isMobile ? 'small' : 'middle'}
                className={`rounded-full px-4 text-[12px] font-medium transition-all ${selectedHelper === 'today' ? 'border-[#2563EB] bg-[#2563EB] text-white' : 'border-gray-200 bg-gray-50 text-gray-600 hover:border-[#2563EB]'}`}
                onClick={() => handleHelperChange('today')}
              >
                {t('report.today')}
              </Button>
              <Button
                size={isMobile ? 'small' : 'middle'}
                className={`rounded-full px-4 text-[12px] font-medium transition-all ${selectedHelper === 'yesterday' ? 'border-[#2563EB] bg-[#2563EB] text-white' : 'border-gray-200 bg-gray-50 text-gray-600 hover:border-[#2563EB]'}`}
                onClick={() => handleHelperChange('yesterday')}
              >
                {t('report.yesterday')}
              </Button>
              <Button
                size={isMobile ? 'small' : 'middle'}
                className={`rounded-full px-4 text-[12px] font-medium transition-all ${selectedHelper === 'this-week' ? 'border-[#2563EB] bg-[#2563EB] text-white' : 'border-gray-200 bg-gray-50 text-gray-600 hover:border-[#2563EB]'}`}
                onClick={() => handleHelperChange('this-week')}
              >
                {t('report.thisWeek')}
              </Button>
              <Button
                size={isMobile ? 'small' : 'middle'}
                className={`rounded-full px-4 text-[12px] font-medium transition-all ${selectedHelper === 'this-month' ? 'border-[#2563EB] bg-[#2563EB] text-white' : 'border-gray-200 bg-gray-50 text-gray-600 hover:border-[#2563EB]'}`}
                onClick={() => handleHelperChange('this-month')}
              >
                {t('report.thisMonth')}
              </Button>
              <Button
                size={isMobile ? 'small' : 'middle'}
                className={`rounded-full px-4 text-[12px] font-medium transition-all ${selectedHelper === 'last-month' ? 'border-[#2563EB] bg-[#2563EB] text-white' : 'border-gray-200 bg-gray-50 text-gray-600 hover:border-[#2563EB]'}`}
                onClick={() => handleHelperChange('last-month')}
              >
                {t('report.lastMonth')}
              </Button>
              <Button
                size={isMobile ? 'small' : 'middle'}
                className={`rounded-full px-4 text-[12px] font-medium transition-all ${selectedHelper === 'custom' ? 'border-[#2563EB] bg-[#2563EB] text-white' : 'border-gray-200 bg-gray-50 text-gray-600 hover:border-[#2563EB]'}`}
                onClick={() => setSelectedHelper('custom')}
              >
                {t('report.custom')}
              </Button>

              {(selectedCategories.length > 0 || selectedHelper !== 'today') && (
                <Button type="link" onClick={handleReset} className="flex items-center gap-1 text-gray-400 hover:text-red-500">
                  <ReloadOutlined className="text-[10px]" /> {t('common.reset')}
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
                  className="w-full rounded-lg sm:w-[320px]"
                  size="large"
                />
              </div>
            )}
          </div>
        </div>
      </div>

      <div>
        <div className="mb-4 text-[11px] font-bold uppercase tracking-[0.1em] text-gray-400">{t('report.income.transactionDetails')}</div>
        <div className="overflow-x-auto">
          <IncomeReportDocument
            ref={reportRef}
            transactions={data?.transactions || []}
            totalIncome={data?.totalIncome || 0}
            breakdown={data?.breakdown || {}}
            companyName={companyName}
            logoDataUrl={profile?.logo_data_url}
            periodText={periodText}
            categoryText={selectedCategoryText}
            printDateText={printDateText}
          />
        </div>
      </div>
    </div>
  );
}
