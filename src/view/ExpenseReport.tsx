import { Loading } from '@/components/Loading';
import { useExpenseReport } from '@/hooks/useReports';
import { useI18n } from '@/hooks/useI18n';
import { getFinanceCategoryLabel } from '@/i18n/finance';
import dayjs from '@/lib/dayjs';
import { exportPdf, exportXlsx, type ExportTarget } from '@/utils/export';
import { formatCurrency } from '@/utils/formatters';
import { FileExcelOutlined, FilePdfOutlined, ReloadOutlined } from '@ant-design/icons';
import { App, Button, DatePicker, Select, Typography } from 'antd';
import autoTable from 'jspdf-autotable';
import { useState } from 'react';
import ExportActions from '@/components/ExportActions';
import { useIsMobile } from '@/hooks/useIsMobile';
import DesktopExpenseTable from './expense-report/DesktopExpenseTable';
import MobileExpenseList from './expense-report/MobileExpenseList';

const { Title } = Typography;

export default function ExpenseReport() {
  const { message } = App.useApp();
  const { t } = useI18n();
  const isMobile = useIsMobile();
  const [startDate, setStartDate] = useState<string | undefined>(dayjs.tz().format('YYYY-MM-DD'));
  const [endDate, setEndDate] = useState<string | undefined>(dayjs.tz().format('YYYY-MM-DD'));
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>([
    dayjs.tz().startOf('day'),
    dayjs.tz().endOf('day'),
  ]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedHelper, setSelectedHelper] = useState<string | undefined>('today');

  const { data, isLoading, refetch } = useExpenseReport(startDate, endDate, selectedCategories);
  const expenseCategories = [
    { value: 'PEMBELIAN_STOK', label: t('finance.category.stockPurchaseOption') },
    { value: 'OPERASIONAL', label: t('finance.category.operationalOption') },
    { value: 'GAJI', label: t('finance.category.GAJI') },
    { value: 'PERLENGKAPAN', label: t('finance.category.PERLENGKAPAN') },
    { value: 'MAKAN', label: t('finance.category.MAKAN') },
    { value: 'TRANSPORT', label: t('finance.category.TRANSPORT') },
  ];

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
    if (!data) return;

    try {
      await exportPdf({
        filename: `laporan-pengeluaran-${dayjs().tz().format('YYYY-MM-DD')}.pdf`,
        target,
        build: (doc) => {
          const title = t('report.expense.title');
          const period = `${t('report.periodWithColon')} ${startDate || t('report.allPeriod')} s/d ${endDate || t('report.allPeriod')}`;
          const printDate = `${t('report.printDate')} ${dayjs().tz().format('YYYY-MM-DD HH:mm:ss')}`;

          doc.setFontSize(18);
          doc.text(title, 14, 22);
          doc.setFontSize(11);
          doc.text(period, 14, 30);
          doc.text(printDate, 14, 38);

          const tableData = data.transactions.map((transaction) => [
            dayjs(transaction.created_at).tz().format('YYYY-MM-DD HH:mm'),
            transaction.description || '-',
            getFinanceCategoryLabel(transaction.category, t),
            formatCurrency(transaction.amount),
          ]);

          autoTable(doc, {
            startY: 45,
            head: [[t('report.dateTime'), t('report.descriptionLong'), t('report.category'), t('report.amount')]],
            body: tableData,
            foot: [['', '', t('report.totalOverall'), formatCurrency(data.totalExpense)]],
            theme: 'grid',
            headStyles: { fillColor: [41, 128, 185], textColor: 255 },
            footStyles: { fillColor: [241, 241, 241], textColor: 0, fontStyle: 'bold' },
          });
        },
      });
      message.success(t('report.expense.exportPdfSuccess'));
    } catch (error) {
      console.error('Failed to export expense PDF:', error);
      message.error(t('report.expense.exportPdfFailed'));
    }
  };

  const handleExportExcel = async (target: ExportTarget = 'auto') => {
    if (!data) return;

    try {
      const header = [
        [t('report.expense.title')],
        [`${t('report.periodWithColon')} ${startDate || t('report.allPeriod')} s/d ${endDate || t('report.allPeriod')}`],
        [`${t('report.printDate')} ${dayjs().tz().format('YYYY-MM-DD HH:mm:ss')}`],
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
        ['', '', t('report.totalOverall'), data.totalExpense],
      ];

      await exportXlsx({
        filename: `laporan-pengeluaran-${dayjs().tz().format('YYYY-MM-DD')}.xlsx`,
        target,
        sheets: [
          {
            name: t('report.expense.title'),
            rows: [...header, ...body, ...footer],
          },
        ],
      });
      message.success(t('report.expense.exportExcelSuccess'));
    } catch (error) {
      console.error('Failed to export expense Excel:', error);
      message.error(t('report.expense.exportExcelFailed'));
    }
  };

  if (isLoading) return <Loading />;

  return (
    <div className="p-4 sm:p-6 bg-[#FDFDFD] min-h-screen">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <div>
          <Title level={4} className="!mb-1 !font-bold text-gray-900">{t('report.expense.title')}</Title>
          <p className="text-gray-500 text-xs sm:text-sm">{t('report.expense.subtitle')}</p>
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
                key: 'pdf',
                label: 'PDF',
                icon: <FilePdfOutlined className="text-[12px]" />,
                onExport: handleExportPDF,
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

      {/* FILTER SECTION */}
      <div className="mb-8 bg-white p-5 rounded-xl border border-gray-100 shadow-sm">
        <div className="text-[11px] font-bold text-gray-400 tracking-[0.1em] mb-4 uppercase">{t('report.parameterTitle')}</div>
        <div className="space-y-5">
          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-gray-700 ml-0.5">{t('report.expenseCategory')}</span>
            <Select
              mode="multiple"
              placeholder={t('report.allCategories')}
              className="w-full"
              value={selectedCategories}
              onChange={setSelectedCategories}
              allowClear
              options={expenseCategories}
              size="large"
            />
          </div>
          
          <div className="flex flex-col gap-2.5">
            <span className="text-[13px] font-medium text-gray-700 ml-0.5">{t('report.dateRange')}</span>
            <div className="flex flex-wrap gap-2">
              <Button 
                size={isMobile ? 'small' : 'middle'}
                className={`rounded-full px-4 text-[12px] font-medium transition-all ${selectedHelper === 'today' ? 'bg-[#2563EB] text-white border-[#2563EB]' : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-[#2563EB]'}`} 
                onClick={() => handleHelperChange('today')}
              >
                {t('report.today')}
              </Button>
              <Button 
                size={isMobile ? 'small' : 'middle'}
                className={`rounded-full px-4 text-[12px] font-medium transition-all ${selectedHelper === 'yesterday' ? 'bg-[#2563EB] text-white border-[#2563EB]' : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-[#2563EB]'}`} 
                onClick={() => handleHelperChange('yesterday')}
              >
                {t('report.yesterday')}
              </Button>
              <Button 
                size={isMobile ? 'small' : 'middle'}
                className={`rounded-full px-4 text-[12px] font-medium transition-all ${selectedHelper === 'this-week' ? 'bg-[#2563EB] text-white border-[#2563EB]' : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-[#2563EB]'}`} 
                onClick={() => handleHelperChange('this-week')}
              >
                {t('report.thisWeek')}
              </Button>
              <Button 
                size={isMobile ? 'small' : 'middle'}
                className={`rounded-full px-4 text-[12px] font-medium transition-all ${selectedHelper === 'this-month' ? 'bg-[#2563EB] text-white border-[#2563EB]' : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-[#2563EB]'}`} 
                onClick={() => handleHelperChange('this-month')}
              >
                {t('report.thisMonth')}
              </Button>
              <Button 
                size={isMobile ? 'small' : 'middle'}
                className={`rounded-full px-4 text-[12px] font-medium transition-all ${selectedHelper === 'last-month' ? 'bg-[#2563EB] text-white border-[#2563EB]' : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-[#2563EB]'}`} 
                onClick={() => handleHelperChange('last-month')}
              >
                {t('report.lastMonth')}
              </Button>
              <Button 
                size={isMobile ? 'small' : 'middle'}
                className={`rounded-full px-4 text-[12px] font-medium transition-all ${selectedHelper === 'custom' ? 'bg-[#2563EB] text-white border-[#2563EB]' : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-[#2563EB]'}`} 
                onClick={() => setSelectedHelper('custom')}
              >
                {t('report.custom')}
              </Button>

              {(selectedCategories.length > 0 || selectedHelper !== 'today') && (
                <Button type="link" onClick={handleReset} className="text-gray-400 hover:text-red-500 flex items-center gap-1">
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
                  className="w-full sm:w-[320px] rounded-lg"
                  size="large"
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* DATA SECTION */}
      <div>
        <div className="text-[11px] font-bold text-gray-400 tracking-[0.1em] mb-4 uppercase">{t('report.transactionDetails')}</div>
        
        {isMobile ? (
          <MobileExpenseList 
            transactions={data?.transactions || []} 
            totalExpense={data?.totalExpense || 0}
            expenseCategories={expenseCategories}
          />
        ) : (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <DesktopExpenseTable
              transactions={data?.transactions || []}
              totalExpense={data?.totalExpense || 0}
              expenseCategories={expenseCategories}
            />
          </div>
        )}
      </div>
    </div>
  );
}
