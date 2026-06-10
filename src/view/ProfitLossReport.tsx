import { useMemo, useState } from 'react';
import { Alert, App, Button, Card, DatePicker, Select, Space, Typography } from 'antd';
import { FileExcelOutlined, FilePdfOutlined, ReloadOutlined } from '@ant-design/icons';
import type { Dayjs } from 'dayjs';
import autoTable from 'jspdf-autotable';
import { useLiveQuery } from 'dexie-react-hooks';
import { useQuery } from '@tanstack/react-query';
import CompanyReportHeader from '@/components/report/CompanyReportHeader';
import ExportActions from '@/components/ExportActions';
import { Loading } from '@/components/Loading';
import { useI18n } from '@/hooks/useI18n';
import { useIsMobile } from '@/hooks/useIsMobile';
import dayjs from '@/lib/dayjs';
import { db } from '@/lib/db';
import {
  getIncomeStatementReport,
  type GeneralLedgerReportFilters,
  type IncomeStatementReport,
  type IncomeStatementSection,
} from '@/services/generalLedgerService';
import { getGeneralLedgerReadiness } from '@/utils/accounting/getGeneralLedgerReadiness';
import { exportPdf, exportXlsx, type ExportTarget } from '@/utils/export';
import { formatCurrency } from '@/utils/formatters';

const { Text, Title } = Typography;

type ReportLineKey = keyof Pick<
  IncomeStatementReport,
  'revenue' | 'contra_revenue' | 'net_revenue' | 'cost_of_revenue' | 'gross_profit' | 'operating_expense' | 'expense' | 'net_income'
>;

interface ReportLine {
  key: ReportLineKey;
  label: string;
  amount: number;
  emphasized?: boolean;
}

type PrintableReportRow =
  | { type: 'section'; label: string }
  | { type: 'account'; code: string; label: string; amount: number }
  | { type: 'total'; label: string; amount: number; emphasized?: boolean };

const emptyIncomeStatement: IncomeStatementReport = {
  revenue: 0,
  contra_revenue: 0,
  net_revenue: 0,
  cost_of_revenue: 0,
  gross_profit: 0,
  operating_expense: 0,
  expense: 0,
  net_income: 0,
  sections: [],
};

const getSignedAmountClass = (value: number) => (
  value < 0 ? 'text-red-600' : 'text-gray-900'
);

const hasSectionAmount = (section: IncomeStatementSection | undefined) => (
  Boolean(section && (section.rows.length > 0 || section.total !== 0))
);

export default function ProfitLossReport() {
  const { message } = App.useApp();
  const { t } = useI18n();
  const isMobile = useIsMobile();
  const [startDate, setStartDate] = useState<string | undefined>(dayjs.tz().format('YYYY-MM-DD'));
  const [endDate, setEndDate] = useState<string | undefined>(dayjs.tz().format('YYYY-MM-DD'));
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null] | null>([
    dayjs.tz().startOf('day'),
    dayjs.tz().endOf('day'),
  ]);
  const [selectedHelper, setSelectedHelper] = useState<string | undefined>('today');
  const [accountFilter, setAccountFilter] = useState<string>();

  const generalLedgerModule = useLiveQuery(
    () => db.enabledModules.get('GENERAL_LEDGER'),
    [],
    undefined,
  );
  const accounts = useLiveQuery(
    () => db.chartOfAccounts.orderBy('code').toArray(),
    [],
    [],
  );
  const readinessQuery = useQuery({
    queryKey: ['generalLedgerReadinessForProfitLoss', generalLedgerModule?.updated_at, accounts.length],
    queryFn: getGeneralLedgerReadiness,
  });
  const isModuleEnabled = Boolean(generalLedgerModule?.is_enabled);
  const isLedgerReady = Boolean(readinessQuery.data?.isReady);
  const canShowReport = isModuleEnabled && isLedgerReady;
  const filters = useMemo<GeneralLedgerReportFilters>(() => ({
    startDate: startDate ? dayjs.tz(startDate).startOf('day').toISOString() : undefined,
    endDate: endDate ? dayjs.tz(endDate).endOf('day').toISOString() : undefined,
    accountId: accountFilter,
  }), [accountFilter, endDate, startDate]);
  const reportQuery = useQuery({
    queryKey: ['profitLossReport', filters.startDate, filters.endDate, filters.accountId],
    queryFn: () => getIncomeStatementReport(filters),
    enabled: canShowReport,
  });
  const report = reportQuery.data;
  const accountOptions = accounts
    .filter((account) => (
      account.is_active &&
      ['REVENUE', 'CONTRA_REVENUE', 'EXPENSE'].includes(account.type)
    ))
    .map((account) => ({
      value: account.id,
      label: `${account.code} - ${account.name}`,
    }));
  const selectedAccount = accounts.find((account) => account.id === accountFilter);
  const periodText = `${startDate || t('report.allPeriod')} s/d ${endDate || t('report.allPeriod')}`;
  const sectionLabels = useMemo(() => ({
    REVENUE: t('generalLedger.income.revenue'),
    CONTRA_REVENUE: t('generalLedger.income.contraRevenue'),
    COST_OF_REVENUE: t('report.profitLoss.costOfRevenue'),
    OPERATING_EXPENSE: t('report.profitLoss.operatingExpense'),
  }), [t]);
  const sectionTotalLabels = useMemo(() => ({
    REVENUE: t('report.profitLoss.totalRevenue'),
    CONTRA_REVENUE: t('report.profitLoss.totalContraRevenue'),
    COST_OF_REVENUE: t('report.profitLoss.totalCostOfRevenue'),
    OPERATING_EXPENSE: t('report.profitLoss.totalOperatingExpense'),
  }), [t]);
  const reportLines = useMemo<ReportLine[]>(() => {
    const data = report ?? emptyIncomeStatement;

    return [
      { key: 'revenue', label: t('generalLedger.income.revenue'), amount: data.revenue },
      { key: 'contra_revenue', label: t('generalLedger.income.contraRevenue'), amount: data.contra_revenue },
      { key: 'net_revenue', label: t('generalLedger.income.netRevenue'), amount: data.net_revenue, emphasized: true },
      { key: 'cost_of_revenue', label: t('report.profitLoss.costOfRevenue'), amount: data.cost_of_revenue },
      { key: 'gross_profit', label: t('report.profitLoss.grossProfit'), amount: data.gross_profit, emphasized: true },
      { key: 'operating_expense', label: t('report.profitLoss.operatingExpense'), amount: data.operating_expense },
      { key: 'net_income', label: t('generalLedger.income.netIncome'), amount: data.net_income, emphasized: true },
    ];
  }, [report, t]);
  const printableRows = useMemo<PrintableReportRow[]>(() => {
    const data = report ?? emptyIncomeStatement;
    const sectionByKey = new Map(data.sections.map((section) => [section.key, section]));
    const rows: PrintableReportRow[] = [];
    const pushSection = (key: IncomeStatementSection['key']) => {
      const section = sectionByKey.get(key);
      if (!hasSectionAmount(section)) return;

      rows.push({ type: 'section', label: sectionLabels[key] });
      section?.rows.forEach((accountRow) => {
        rows.push({
          type: 'account',
          code: accountRow.account_code,
          label: accountRow.account_name,
          amount: accountRow.amount,
        });
      });
      rows.push({ type: 'total', label: sectionTotalLabels[key], amount: section?.total ?? 0 });
    };

    pushSection('REVENUE');
    pushSection('CONTRA_REVENUE');
    rows.push({ type: 'total', label: t('generalLedger.income.netRevenue'), amount: data.net_revenue, emphasized: true });
    pushSection('COST_OF_REVENUE');
    rows.push({ type: 'total', label: t('report.profitLoss.grossProfit'), amount: data.gross_profit, emphasized: true });
    pushSection('OPERATING_EXPENSE');
    rows.push({ type: 'total', label: t('generalLedger.income.netIncome'), amount: data.net_income, emphasized: true });

    return rows;
  }, [report, sectionLabels, sectionTotalLabels, t]);

  const handleDateRangeChange = (dates: [Dayjs | null, Dayjs | null] | null) => {
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
    let range: [Dayjs, Dayjs] | null = null;

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
    const todayRange: [Dayjs, Dayjs] = [dayjs.tz().startOf('day'), dayjs.tz().endOf('day')];
    setDateRange(todayRange);
    setStartDate(todayRange[0].format('YYYY-MM-DD'));
    setEndDate(todayRange[1].format('YYYY-MM-DD'));
    setSelectedHelper('today');
    setAccountFilter(undefined);
  };

  const handleExportPDF = async (target: ExportTarget = 'auto') => {
    if (!report) return;

    try {
      const exported = await exportPdf({
        filename: `laporan-laba-rugi-${dayjs().tz().format('YYYY-MM-DD')}.pdf`,
        target,
        build: (doc) => {
          doc.setFontSize(18);
          doc.text(t('report.profitLoss.title'), 14, 22);
          doc.setFontSize(11);
          doc.text(`${t('report.periodWithColon')} ${periodText}`, 14, 30);
          doc.text(`${t('report.printDate')} ${dayjs().tz().format('YYYY-MM-DD HH:mm:ss')}`, 14, 38);
          if (selectedAccount) {
            doc.text(`${t('generalLedger.filterAccount')}: ${selectedAccount.code} - ${selectedAccount.name}`, 14, 46);
          }

          autoTable(doc, {
            startY: selectedAccount ? 54 : 46,
            head: [[t('report.metric'), t('report.amount')]],
            body: printableRows.map((row) => {
              if (row.type === 'section') return [row.label, '', ''];
              if (row.type === 'account') return [row.code, row.label, formatCurrency(row.amount)];
              return ['', row.label, formatCurrency(row.amount)];
            }),
            theme: 'grid',
            headStyles: { fillColor: [41, 128, 185], textColor: 255 },
            columnStyles: {
              0: { cellWidth: 35 },
              2: { halign: 'right' },
            },
            didParseCell: (data) => {
              const row = printableRows[data.row.index];
              if (data.section === 'body' && row?.type === 'section') {
                data.cell.styles.fontStyle = 'bold';
                data.cell.styles.textColor = [0, 114, 188];
              }
              if (data.section === 'body' && row?.type === 'total') {
                data.cell.styles.fontStyle = 'bold';
              }
            },
          });
        },
      });

      if (!exported) return;
      message.success(t('report.profitLoss.exportPdfSuccess'));
    } catch (error) {
      console.error('Failed to export profit loss PDF:', error);
      message.error(t('report.profitLoss.exportPdfFailed'));
    }
  };

  const handleExportExcel = async (target: ExportTarget = 'auto') => {
    if (!report) return;

    try {
      const rows = [
        [t('report.profitLoss.title')],
        [`${t('report.periodWithColon')} ${periodText}`],
        [`${t('report.printDate')} ${dayjs().tz().format('YYYY-MM-DD HH:mm:ss')}`],
        ...(selectedAccount ? [[`${t('generalLedger.filterAccount')}: ${selectedAccount.code} - ${selectedAccount.name}`]] : []),
        [],
        [t('generalLedger.account'), t('report.description'), t('report.amount')],
        ...printableRows.map((row) => {
          if (row.type === 'section') return [row.label, '', ''];
          if (row.type === 'account') return [row.code, row.label, row.amount];
          return ['', row.label, row.amount];
        }),
      ];

      const exported = await exportXlsx({
        filename: `laporan-laba-rugi-${dayjs().tz().format('YYYY-MM-DD')}.xlsx`,
        target,
        sheets: [
          {
            name: t('report.profitLoss.title'),
            rows,
          },
        ],
      });

      if (!exported) return;
      message.success(t('report.profitLoss.exportExcelSuccess'));
    } catch (error) {
      console.error('Failed to export profit loss Excel:', error);
      message.error(t('report.profitLoss.exportExcelFailed'));
    }
  };

  const isLoading = readinessQuery.isLoading || (canShowReport && reportQuery.isLoading);
  if (isLoading) return <Loading />;

  return (
    <div className="min-h-screen bg-[#FDFDFD] p-4 sm:p-6">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Title level={4} className="!mb-1 !font-bold text-gray-900">{t('report.profitLoss.title')}</Title>
          <p className="text-xs text-gray-500 sm:text-sm">{t('report.profitLoss.subtitle')}</p>
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <Button
            className="flex-1 items-center justify-center gap-1.5 sm:flex-none"
            icon={<ReloadOutlined className="text-[12px]" />}
            onClick={() => reportQuery.refetch()}
            loading={reportQuery.isFetching}
            disabled={!canShowReport}
          >
            {t('common.refresh')}
          </Button>
          <ExportActions
            buttonClassName="flex-1 sm:flex-none flex items-center justify-center gap-1.5 bg-[#2563EB] hover:bg-[#1D4ED8] border-none shadow-sm"
            disabled={!canShowReport || !report}
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

      <div className="mb-6">
        <CompanyReportHeader
          reportTitle={t('report.profitLoss.title')}
          reportDescription={t('report.profitLoss.subtitle')}
        />
      </div>

      <div className="mb-8 rounded-lg border border-gray-100 bg-white p-5 shadow-sm">
        <div className="mb-4 text-[11px] font-bold uppercase tracking-[0.1em] text-gray-400">{t('report.parameterTitle')}</div>
        <div className="space-y-5">
          <div className="flex flex-col gap-1.5">
            <span className="ml-0.5 text-[13px] font-medium text-gray-700">{t('generalLedger.filterAccount')}</span>
            <Select
              placeholder={t('finance.allAccounts')}
              className="w-full"
              value={accountFilter}
              onChange={setAccountFilter}
              allowClear
              showSearch
              options={accountOptions}
              optionFilterProp="label"
              size="large"
            />
          </div>

          <div className="flex flex-col gap-2.5">
            <span className="ml-0.5 text-[13px] font-medium text-gray-700">{t('report.dateRange')}</span>
            <div className="flex flex-wrap gap-2">
              {[
                ['today', t('report.today')],
                ['yesterday', t('report.yesterday')],
                ['this-week', t('report.thisWeek')],
                ['this-month', t('report.thisMonth')],
                ['last-month', t('report.lastMonth')],
              ].map(([key, label]) => (
                <Button
                  key={key}
                  size={isMobile ? 'small' : 'middle'}
                  className={`rounded-full px-4 text-[12px] font-medium transition-all ${selectedHelper === key ? 'bg-[#2563EB] text-white border-[#2563EB]' : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-[#2563EB]'}`}
                  onClick={() => handleHelperChange(key)}
                >
                  {label}
                </Button>
              ))}
            </div>
            <DatePicker.RangePicker
              value={dateRange}
              onChange={handleDateRangeChange}
              className="w-full"
              size="large"
            />
          </div>

          <div className="flex justify-end">
            <Button onClick={handleReset}>{t('common.reset')}</Button>
          </div>
        </div>
      </div>

      {!canShowReport ? (
        <Alert
          type="warning"
          showIcon
          message={isModuleEnabled ? t('report.profitLoss.notReadyTitle') : t('report.profitLoss.moduleDisabledTitle')}
          description={isModuleEnabled ? t('report.profitLoss.notReadyMessage') : t('report.profitLoss.moduleDisabledMessage')}
        />
      ) : reportQuery.error ? (
        <Alert
          type="error"
          showIcon
          message={t('report.withDateError', {
            message: reportQuery.error instanceof Error ? reportQuery.error.message : t('common.unknownError'),
          })}
        />
      ) : (
        <Card className="shadow-sm">
          <Space direction="vertical" size="large" className="w-full">
            <div className="flex flex-col gap-1 border-b border-gray-100 pb-4">
              <Text type="secondary">{t('report.periodWithColon')} {periodText}</Text>
              {selectedAccount ? (
                <Text type="secondary">{t('generalLedger.filterAccount')}: {selectedAccount.code} - {selectedAccount.name}</Text>
              ) : null}
            </div>

            <div className="overflow-x-auto">
              <div className="min-w-[720px]">
                <div className="grid grid-cols-[160px_1fr_180px] border-b border-gray-200 pb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                  <div>{t('generalLedger.account')}</div>
                  <div>{t('report.description')}</div>
                  <div className="text-right">{t('report.amount')}</div>
                </div>

                <div className="divide-y divide-gray-100">
                  {printableRows.map((row, index) => {
                    if (row.type === 'section') {
                      return (
                        <div key={`${row.type}-${row.label}-${index}`} className="grid grid-cols-[160px_1fr_180px] pt-5 pb-2 text-sm font-semibold text-[#0072bc]">
                          <div className="col-span-3">{row.label}</div>
                        </div>
                      );
                    }

                    if (row.type === 'account') {
                      return (
                        <div key={`${row.type}-${row.code}-${index}`} className="grid grid-cols-[160px_1fr_180px] py-2 text-sm text-gray-800">
                          <div className="pl-8 text-[#00a6c8]">{row.code}</div>
                          <div className="font-medium text-gray-900">{row.label}</div>
                          <div className="text-right">Rp {formatCurrency(row.amount)}</div>
                        </div>
                      );
                    }

                    return (
                      <div key={`${row.type}-${row.label}-${index}`} className="grid grid-cols-[160px_1fr_180px] py-2 text-sm font-semibold">
                        <div />
                        <div className={row.emphasized ? 'text-[#0072bc]' : 'text-emerald-600'}>{row.label}</div>
                        <div className={`text-right ${row.label === t('generalLedger.income.netIncome') ? getSignedAmountClass(row.amount) : row.emphasized ? 'text-[#0072bc]' : 'text-emerald-600'}`}>
                          Rp {formatCurrency(row.amount)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {reportLines.filter((line) => line.emphasized).map((line) => (
                <div key={line.key} className="rounded-lg border border-gray-100 bg-gray-50 p-4">
                  <Text type="secondary" className="text-xs">{line.label}</Text>
                  <div className={`mt-1 text-lg font-bold ${line.key === 'net_income' ? getSignedAmountClass(line.amount) : 'text-gray-900'}`}>
                    Rp {formatCurrency(line.amount)}
                  </div>
                </div>
              ))}
            </div>
          </Space>
        </Card>
      )}
    </div>
  );
}
