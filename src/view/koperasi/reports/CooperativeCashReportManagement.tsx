import { useMemo, useRef, useState } from 'react';
import { FilePdfOutlined, FileTextOutlined } from '@ant-design/icons';
import { App, Alert, Button, DatePicker, Empty, Select, Space, Typography } from 'antd';
import type { Dayjs } from 'dayjs';
import { Banknote, RefreshCw } from 'lucide-react';
import ExportActions from '@/components/ExportActions';
import { useCooperativeCashReport } from '@/hooks/useCooperativeCashReport';
import { useCompanyProfileSetting } from '@/hooks/useCompanyProfileSetting';
import { useI18n } from '@/hooks/useI18n';
import dayjs from '@/lib/dayjs';
import type {
  CooperativeCashReportEmployee,
  CooperativeCashReportRowKey,
} from '@/services/cooperativeCashReportService';
import { exportCsv, exportHtmlPdf, saveExportFile, type ExportRows, type ExportTarget } from '@/utils/export';
import CooperativeCashReport from './CooperativeCashReport';

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

const employeeLabel = (
  employee: Pick<CooperativeCashReportEmployee, 'employee_name' | 'employee_code'>,
) => `${employee.employee_name} (${employee.employee_code || '-'})`;

const cashReportRowLabelKeys = {
  STORTING: 'cooperative.cashReport.storting',
  DROP: 'cooperative.cashReport.drop',
  TABUNGAN: 'cooperative.cashReport.saving',
  IPTW: 'cooperative.cashReport.iptw',
} as const satisfies Record<CooperativeCashReportRowKey, string>;

export default function CooperativeCashReportManagement() {
  const { message } = App.useApp();
  const { t, locale } = useI18n();
  const { profile } = useCompanyProfileSetting();
  const reportRef = useRef<HTMLDivElement | null>(null);
  const [selectedDate, setSelectedDate] = useState<Dayjs>(() => dayjs().tz().startOf('day'));
  const [employeeId, setEmployeeId] = useState<string | undefined>();
  const filters = useMemo(() => ({
    date: selectedDate.toISOString(),
    employeeId,
  }), [employeeId, selectedDate]);
  const reportQuery = useCooperativeCashReport(filters);
  const report = reportQuery.data;
  const isLoading = reportQuery.isLoading || reportQuery.isFetching;
  const hasEmployees = Boolean(report?.employees.length);
  const selectedEmployee = report?.employees.find((employee) => employee.employee_id === employeeId);
  const employeeText = selectedEmployee
    ? employeeLabel(selectedEmployee)
    : t('cooperative.cashReport.allEmployees');
  const companyName = profile?.company_name || t('cooperative.ledger.companyFallback');
  const dayText = selectedDate.locale(locale).format('dddd');
  const dateText = selectedDate.locale(locale).format('DD MMMM YYYY');
  const printDateText = dayjs().tz().locale(locale).format('DD MMMM YYYY HH:mm:ss');
  const employeeOptions = useMemo(() => [
    { value: ALL_VALUE, label: t('cooperative.cashReport.allEmployees') },
    ...(report?.employeeOptions ?? []).map((employee) => ({
      value: employee.id,
      label: `${employee.name} (${employee.code || '-'})`,
    })),
  ], [report?.employeeOptions, t]);

  const buildCsvRows = (): ExportRows => {
    if (!report) return [];

    const rows: ExportRows = [
      [t('cooperative.cashReport.title')],
      [t('cooperative.cashReport.employee'), employeeText],
      [t('cooperative.cashReport.day'), dayText],
      [t('cooperative.cashReport.date'), dateText],
    ];

    report.employees.forEach((employee) => {
      rows.push([]);
      rows.push([t('cooperative.cashReport.employee'), employeeLabel(employee)]);
      rows.push([
        t('cooperative.cashReport.description'),
        t('cooperative.cashReport.incoming'),
        t('cooperative.cashReport.outgoing'),
      ]);
      employee.rows.forEach((row) => {
        rows.push([
          t(cashReportRowLabelKeys[row.key]),
          row.incoming_amount,
          row.outgoing_amount,
        ]);
      });
      rows.push([
        t('cooperative.cashReport.total'),
        employee.total_incoming_amount,
        employee.total_outgoing_amount,
      ]);
      rows.push([
        t('cooperative.cashReport.totalBalance'),
        employee.total_balance_amount,
      ]);
    });

    return rows;
  };

  const buildHtmlDocument = () => `<!doctype html>
<html lang="${locale}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(t('cooperative.cashReport.title'))}</title>
  <style>
    @page { size: A4 portrait; margin: 12mm; }
    * { box-sizing: border-box; }
    body { margin: 0; background: #f3f4f6; color: #111827; font-family: Arial, sans-serif; padding: 24px; }
    .report-shell { margin: 0 auto; max-width: 900px; }
    @media print {
      body { background: #fff; padding: 0; }
    }
  </style>
</head>
<body>
  <main class="report-shell">${reportRef.current?.outerHTML ?? ''}</main>
</body>
</html>`;

  const exportFilenameBase = `laporan-tunai-${selectedDate.format('YYYY-MM-DD')}${employeeId ? `-${employeeId}` : ''}`;

  const handleExportCsv = async (target: ExportTarget = 'auto') => {
    if (!report) return;
    try {
      const exported = await exportCsv({
        filename: `${exportFilenameBase}.csv`,
        rows: buildCsvRows(),
        target,
      });
      if (exported) message.success(t('cooperative.cashReport.exportCsvSuccess'));
    } catch (error) {
      console.error('Failed to export cooperative cash report CSV:', error);
      message.error(t('cooperative.cashReport.exportCsvFailed'));
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
      if (exported) message.success(t('cooperative.cashReport.exportHtmlSuccess'));
    } catch (error) {
      console.error('Failed to export cooperative cash report HTML:', error);
      message.error(t('cooperative.cashReport.exportHtmlFailed'));
    }
  };

  const handleExportPdf = async (target: ExportTarget = 'auto') => {
    if (!report || !reportRef.current) return;
    try {
      const exported = await exportHtmlPdf({
        filename: `${exportFilenameBase}.pdf`,
        element: reportRef.current,
        orientation: 'portrait',
        target,
      });
      if (exported) message.success(t('cooperative.cashReport.exportPdfSuccess'));
    } catch (error) {
      console.error('Failed to export cooperative cash report PDF:', error);
      message.error(t('cooperative.cashReport.exportPdfFailed'));
    }
  };

  return (
    <div className="space-y-4 p-3 sm:p-4 md:p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <Title level={2} className="!mb-1 flex items-center gap-2">
            <Banknote size={24} />
            {t('cooperative.cashReport.title')}
          </Title>
          <Text type="secondary">{t('cooperative.cashReport.subtitle')}</Text>
        </div>
        <Space wrap>
          <Button
            icon={<RefreshCw size={16} />}
            onClick={() => void reportQuery.refetch()}
            loading={isLoading}
          >
            {t('common.refresh')}
          </Button>
          <ExportActions
            buttonType="default"
            disabled={!hasEmployees}
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

      <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(180px,260px)_minmax(220px,360px)]">
        <div>
          <Text strong>{t('cooperative.cashReport.date')}</Text>
          <DatePicker
            className="mt-2 w-full"
            value={selectedDate}
            format="DD MMMM YYYY"
            onChange={(value) => setSelectedDate(value?.startOf('day') ?? dayjs().tz().startOf('day'))}
            data-testid="koperasi-cash-report-date-filter"
          />
        </div>
        <div>
          <Text strong>{t('cooperative.cashReport.employee')}</Text>
          <Select
            className="mt-2 w-full"
            value={employeeId ?? ALL_VALUE}
            options={employeeOptions}
            onChange={(value) => setEmployeeId(value === ALL_VALUE ? undefined : value)}
            showSearch
            optionFilterProp="label"
            data-testid="koperasi-cash-report-employee-filter"
          />
        </div>
      </div>

      {!isLoading && !hasEmployees ? (
        <Empty description={t('cooperative.cashReport.empty')} />
      ) : null}

      <div style={{ overflowX: 'auto' }}>
        <CooperativeCashReport
          ref={reportRef}
          data={report}
          companyName={companyName}
          logoDataUrl={profile?.logo_data_url}
          dateText={dateText}
          dayText={dayText}
          employeeText={employeeText}
          printDateText={printDateText}
        />
      </div>
    </div>
  );
}
