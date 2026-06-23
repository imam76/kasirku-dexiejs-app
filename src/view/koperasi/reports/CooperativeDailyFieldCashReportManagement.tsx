import { useMemo, useRef, useState } from 'react';
import { FilePdfOutlined, FileTextOutlined } from '@ant-design/icons';
import { App, Alert, Button, DatePicker, Empty, Select, Space, Typography } from 'antd';
import type { Dayjs } from 'dayjs';
import { FileText, RefreshCw } from 'lucide-react';
import ExportActions from '@/components/ExportActions';
import { useCompanyProfileSetting } from '@/hooks/useCompanyProfileSetting';
import {
  useCooperativeDailyFieldCashReport,
  type CooperativeDailyFieldCashReportFilters,
} from '@/hooks/useCooperativeDailyFieldCashReport';
import { useI18n } from '@/hooks/useI18n';
import dayjs from '@/lib/dayjs';
import {
  COOPERATIVE_DAILY_FIELD_CASH_UNASSIGNED_EMPLOYEE,
  type CooperativeDailyFieldCashEmployeeOption,
  type CooperativeDailyFieldCashReportGroup,
} from '@/services/cooperativeDailyFieldCashReportService';
import { exportCsv, exportHtmlPdf, saveExportFile, type ExportRows, type ExportTarget } from '@/utils/export';
import CooperativeDailyFieldCashReport from './CooperativeDailyFieldCashReport';

const { Text, Title } = Typography;

const ALL_VALUE = '__ALL__';

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

const formatDateDot = (value: string) => dayjs(value).tz().format('DD.MM.YYYY');

const formatDayName = (value: string) => dayjs(value).tz().format('dddd').toUpperCase();

const getCollectorLabel = (
  employee: Pick<CooperativeDailyFieldCashEmployeeOption, 'name' | 'position'>,
) => employee.position ? `${employee.name} - ${employee.position}` : employee.name;

const getGroupCollectorLabel = (
  group: Pick<CooperativeDailyFieldCashReportGroup, 'employee_name' | 'employee_position'>,
  unassignedLabel: string,
) => {
  if (!group.employee_name) return unassignedLabel;
  return group.employee_position ? `${group.employee_name} - ${group.employee_position}` : group.employee_name;
};

export default function CooperativeDailyFieldCashReportManagement() {
  const { message } = App.useApp();
  const { t, locale } = useI18n();
  const { profile } = useCompanyProfileSetting();
  const reportRef = useRef<HTMLDivElement | null>(null);
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs]>(() => [
    dayjs().tz().startOf('month'),
    dayjs().tz().endOf('day'),
  ]);
  const [employeeId, setEmployeeId] = useState<string | undefined>();
  const filters = useMemo<CooperativeDailyFieldCashReportFilters>(() => ({
    fromDate: dateRange[0].toISOString(),
    toDate: dateRange[1].toISOString(),
    employeeId,
  }), [employeeId, dateRange]);
  const reportQuery = useCooperativeDailyFieldCashReport(filters);
  const report = reportQuery.data;
  const isLoading = reportQuery.isLoading || reportQuery.isFetching;
  const hasRows = Boolean(report?.groups.length && report?.groups.some(g => g.rows.length > 0));
  const companyName = profile?.company_name || t('cooperative.ledger.companyFallback');
  const printDateText = dayjs().tz().format('YYYY-MM-DD HH:mm:ss');
  
  const periodText = `${formatDateDot(dateRange[0].toISOString())} - ${formatDateDot(dateRange[1].toISOString())}`;

  const selectedEmployee = report?.employeeOptions?.find((employee) => employee.id === employeeId);
  const collectorText = (() => {
    if (!employeeId) return t('cooperative.reports.dailyFieldCash.allCollectors');
    if (employeeId === COOPERATIVE_DAILY_FIELD_CASH_UNASSIGNED_EMPLOYEE) {
      return t('cooperative.memberRegister.unassignedEmployee');
    }
    return selectedEmployee ? getCollectorLabel(selectedEmployee) : employeeId;
  })();
  const employeeOptions = useMemo(() => [
    { value: ALL_VALUE, label: t('cooperative.reports.dailyFieldCash.allCollectors') },
    {
      value: COOPERATIVE_DAILY_FIELD_CASH_UNASSIGNED_EMPLOYEE,
      label: t('cooperative.memberRegister.unassignedEmployee'),
    },
    ...(report?.employeeOptions ?? []).map((employee) => ({
      value: employee.id,
      label: getCollectorLabel(employee),
    })),
  ], [report?.employeeOptions, t]);

  const labels = {
    title: t('cooperative.reports.dailyFieldCash.title'),
    period: t('cooperative.reports.dailyFieldCash.period'),
    collector: t('cooperative.reports.dailyFieldCash.collector'),
    areas: t('cooperative.reports.dailyStorting.areas'),
    date: t('cooperative.reports.table.date'),
    day: t('cooperative.reports.dailyStorting.day'),
    stortingLoanPayment: t('cooperative.reports.dailyFieldCash.stortingLoanPayment'),
    stortingSavingDeposit: t('cooperative.reports.dailyFieldCash.stortingSavingDeposit'),
    loanDisbursement: t('cooperative.reports.dailyFieldCash.loanDisbursement'),
    savingWithdrawal: t('cooperative.reports.dailyFieldCash.savingWithdrawal'),
    iptwPayout: t('cooperative.reports.dailyFieldCash.iptwPayout'),
    droppingFromFinance: t('cooperative.reports.dailyFieldCash.droppingFromFinance'),
    depositToFinance: t('cooperative.reports.dailyFieldCash.depositToFinance'),
    netCash: t('cooperative.reports.dailyFieldCash.netCash'),
    cashAccountBalance: t('cooperative.reports.dailyFieldCash.cashAccountBalance'),
  };

  const buildCsvRows = (): ExportRows => {
    if (!report) return [];

    const rows: ExportRows = [
      [labels.title, printDateText],
      [labels.period, periodText],
      [labels.collector, collectorText],
      [
        t('common.total'),
        report.summary.storting_loan_payment_amount,
        report.summary.storting_saving_deposit_amount,
        report.summary.loan_disbursement_amount,
        report.summary.saving_withdrawal_amount,
        report.summary.iptw_payout_amount,
        report.summary.dropping_from_finance_amount,
        report.summary.deposit_to_finance_amount,
        report.summary.net_cash_amount,
      ],
    ];

    (report.groups ?? []).forEach((group) => {
      rows.push([]);
      rows.push([
        labels.collector,
        getGroupCollectorLabel(group, t('cooperative.memberRegister.unassignedEmployee')),
      ]);
      rows.push([labels.areas, group.area_names.join(', ') || '-']);
      rows.push([labels.cashAccountBalance, group.cash_account_balance]);

      rows.push([
        labels.date,
        labels.day,
        labels.stortingLoanPayment,
        labels.stortingSavingDeposit,
        labels.loanDisbursement,
        labels.savingWithdrawal,
        labels.iptwPayout,
        labels.droppingFromFinance,
        labels.depositToFinance,
        labels.netCash,
      ]);
      group.rows.forEach((row) => {
        rows.push([
          formatDateDot(row.date_key),
          formatDayName(row.date_key),
          row.storting_loan_payment_amount,
          row.storting_saving_deposit_amount,
          row.loan_disbursement_amount,
          row.saving_withdrawal_amount,
          row.iptw_payout_amount,
          row.dropping_from_finance_amount,
          row.deposit_to_finance_amount,
          row.net_cash_amount,
        ]);
      });
      rows.push([
        t('common.total'),
        '',
        group.summary.storting_loan_payment_amount,
        group.summary.storting_saving_deposit_amount,
        group.summary.loan_disbursement_amount,
        group.summary.saving_withdrawal_amount,
        group.summary.iptw_payout_amount,
        group.summary.dropping_from_finance_amount,
        group.summary.deposit_to_finance_amount,
        group.summary.net_cash_amount,
      ]);
    });

    return rows;
  };

  const buildHtmlDocument = () => {
    const reportHtml = reportRef.current?.outerHTML;

    return `<!doctype html>
<html lang="${locale}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(labels.title)}</title>
  <style>
    @page { size: A4 landscape; margin: 10mm; }
    * { box-sizing: border-box; }
    body { margin: 0; background: #f3f4f6; color: #111827; font-family: Arial, sans-serif; padding: 24px; }
    .report-shell { margin: 0 auto; width: max-content; }
  </style>
</head>
<body>
  <main class="report-shell">
    ${reportHtml ?? ''}
  </main>
</body>
</html>`;
  };

  const exportFilenameBase = `laporan-kas-harian-pdl-${dateRange[0].format('YYYYMMDD')}-${dateRange[1].format('YYYYMMDD')}`;

  const handleExportCsv = async (target: ExportTarget = 'auto') => {
    if (!report) return;
    try {
      const exported = await exportCsv({
        filename: `${exportFilenameBase}.csv`,
        rows: buildCsvRows(),
        target,
      });
      if (!exported) return;
      message.success(t('cooperative.reports.dailyFieldCash.exportCsvSuccess'));
    } catch (error) {
      console.error('Failed to export daily field cash CSV:', error);
      message.error(t('cooperative.reports.dailyFieldCash.exportCsvFailed'));
    }
  };

  const handleExportHtml = async (target: ExportTarget = 'auto') => {
    if (!report || !reportRef.current) return;
    try {
      const exported = await saveExportFile({
        filename: `${exportFilenameBase}.html`,
        mimeType: 'text/html',
        content: buildHtmlDocument(),
        target,
      });
      if (!exported) return;
      message.success(t('cooperative.reports.dailyFieldCash.exportHtmlSuccess'));
    } catch (error) {
      console.error('Failed to export daily field cash HTML:', error);
      message.error(t('cooperative.reports.dailyFieldCash.exportHtmlFailed'));
    }
  };

  const handleExportPdf = async (target: ExportTarget = 'auto') => {
    if (!report || !reportRef.current) return;
    try {
      const exported = await exportHtmlPdf({
        filename: `${exportFilenameBase}.pdf`,
        element: reportRef.current,
        orientation: 'landscape',
        target,
      });
      if (!exported) return;
      message.success(t('cooperative.reports.dailyFieldCash.exportPdfSuccess'));
    } catch (error) {
      console.error('Failed to export daily field cash PDF:', error);
      message.error(t('cooperative.reports.dailyFieldCash.exportPdfFailed'));
    }
  };

  return (
    <div className="space-y-4 p-3 sm:p-4 md:p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <Title level={2} className="!mb-1 flex items-center gap-2">
            <FileText size={24} />
            {labels.title}
          </Title>
          <Text type="secondary">{t('cooperative.reports.dailyFieldCash.subtitle')}</Text>
        </div>
        <Space wrap>
          <Button icon={<RefreshCw size={16} />} onClick={() => void reportQuery.refetch()} loading={isLoading}>
            {t('common.refresh')}
          </Button>
          <ExportActions
            buttonType="default"
            disabled={!hasRows}
            formats={[
              {
                key: 'pdf',
                label: 'PDF',
                icon: <FilePdfOutlined />,
                onExport: handleExportPdf,
              },
              {
                key: 'html',
                label: 'HTML',
                icon: <FileTextOutlined />,
                onExport: handleExportHtml,
              },
              {
                key: 'csv',
                label: 'CSV',
                icon: <FileTextOutlined />,
                onExport: handleExportCsv,
              },
            ]}
          />
        </Space>
      </div>

      {reportQuery.error ? (
        <Alert
          type="error"
          showIcon
          message={reportQuery.error instanceof Error ? reportQuery.error.message : t('common.unknownError')}
        />
      ) : null}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(280px,360px)_minmax(220px,340px)]">
        <div>
          <Text strong>{labels.period}</Text>
          <DatePicker.RangePicker
            className="mt-2 w-full"
            value={dateRange}
            onChange={(values) => {
              if (values?.[0] && values?.[1]) {
                setDateRange([values[0].startOf('day'), values[1].endOf('day')]);
              }
            }}
          />
        </div>
        <div>
          <Text strong>{labels.collector}</Text>
          <Select
            className="mt-2 w-full"
            value={employeeId ?? ALL_VALUE}
            options={employeeOptions}
            onChange={(value) => setEmployeeId(value === ALL_VALUE ? undefined : value)}
            showSearch
            optionFilterProp="label"
          />
        </div>
      </div>

      {!isLoading && !hasRows ? (
        <Empty description={t('cooperative.reports.dailyFieldCash.empty')} />
      ) : null}

      <div style={{ overflowX: 'auto' }}>
        <CooperativeDailyFieldCashReport
          ref={reportRef}
          data={report}
          companyName={companyName}
          logoDataUrl={profile?.logo_data_url}
          periodText={periodText}
          collectorText={collectorText}
          printDateText={printDateText}
        />
      </div>
    </div>
  );
}
