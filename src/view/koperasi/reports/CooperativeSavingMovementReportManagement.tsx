import { useMemo, useRef, useState } from 'react';
import { FilePdfOutlined, FileTextOutlined } from '@ant-design/icons';
import { App, Alert, Button, DatePicker, Empty, Select, Space, Typography } from 'antd';
import type { Dayjs } from 'dayjs';
import { FileText, RefreshCw } from 'lucide-react';
import ExportActions from '@/components/ExportActions';
import { useCompanyProfileSetting } from '@/hooks/useCompanyProfileSetting';
import { useCooperativeSavingMovementReport } from '@/hooks/useCooperativeSavingMovementReport';
import { useI18n } from '@/hooks/useI18n';
import dayjs from '@/lib/dayjs';
import {
  COOPERATIVE_SAVING_MOVEMENT_UNASSIGNED_EMPLOYEE,
  type CooperativeSavingMovementDirection,
  type CooperativeSavingMovementEmployeeOption,
  type CooperativeSavingMovementReportGroup,
  type CooperativeSavingMovementReportRow,
} from '@/services/cooperativeSavingMovementReportService';
import type { CooperativeSavingType } from '@/types';
import { exportCsv, exportHtmlPdf, saveExportFile, type ExportRows, type ExportTarget } from '@/utils/export';
import CooperativeSavingMovementReport from './CooperativeSavingMovementReport';

const { Text, Title } = Typography;

type CooperativeSavingMovementReportManagementProps = {
  direction: CooperativeSavingMovementDirection;
};

const ALL_VALUE = '__ALL__';
const savingTypeValues: CooperativeSavingType[] = ['POKOK', 'WAJIB', 'SUKARELA'];

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

const formatTimeText = (value: string) => dayjs(value).tz().format('HH:mm');

const formatDayName = (value: string) => dayjs(value).tz().format('dddd').toUpperCase();

const getEmployeeLabel = (
  employee: Pick<CooperativeSavingMovementEmployeeOption, 'name' | 'position'>,
) => employee.position ? `${employee.name} - ${employee.position}` : employee.name;

export default function CooperativeSavingMovementReportManagement({
  direction,
}: CooperativeSavingMovementReportManagementProps) {
  const { message } = App.useApp();
  const { t, locale } = useI18n();
  const { profile } = useCompanyProfileSetting();
  const reportRef = useRef<HTMLDivElement | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<Dayjs>(() => dayjs().tz().startOf('month'));
  const [employeeId, setEmployeeId] = useState<string | undefined>();
  const [savingType, setSavingType] = useState<CooperativeSavingType | undefined>();
  const filters = useMemo(() => ({
    monthDate: selectedMonth.startOf('month').toISOString(),
    employeeId,
    savingType,
    direction,
  }), [direction, employeeId, savingType, selectedMonth]);
  const reportQuery = useCooperativeSavingMovementReport(filters);
  const report = reportQuery.data;
  const isLoading = reportQuery.isLoading || reportQuery.isFetching;
  const hasRows = Boolean(report?.rows.length);
  const isIncoming = direction === 'IN';
  const title = isIncoming
    ? t('cooperative.savingMovementReport.in.title')
    : t('cooperative.savingMovementReport.out.title');
  const subtitle = isIncoming
    ? t('cooperative.savingMovementReport.in.subtitle')
    : t('cooperative.savingMovementReport.out.subtitle');
  const emptyText = isIncoming
    ? t('cooperative.savingMovementReport.in.empty')
    : t('cooperative.savingMovementReport.out.empty');
  const companyName = profile?.company_name || t('cooperative.ledger.companyFallback');
  const printDateText = dayjs().tz().format('YYYY-MM-DD HH:mm:ss');
  const monthText = selectedMonth.locale(locale).format('MMMM YYYY').toUpperCase();
  const exportFilenameBase = `laporan-${isIncoming ? 'tabungan-masuk' : 'tabungan-keluar'}-${selectedMonth.format('YYYY-MM')}`;

  const savingTypeLabel = (value: CooperativeSavingType) => {
    if (value === 'POKOK') return t('cooperative.savings.type.pokok');
    if (value === 'WAJIB') return t('cooperative.savings.type.wajib');
    return t('cooperative.savings.type.sukarela');
  };
  const withdrawalSourceLabel = (row: CooperativeSavingMovementReportRow) => {
    if (direction === 'IN') return '-';
    return row.withdrawal_source === 'INTEREST'
      ? t('cooperative.savings.withdrawalSource.interestShort')
      : t('cooperative.savings.withdrawalSource.savingShort');
  };
  const selectedEmployee = report?.employeeOptions.find((employee) => employee.id === employeeId);
  const employeeText = (() => {
    if (!employeeId) return t('cooperative.savingMovementReport.allEmployees');
    if (employeeId === COOPERATIVE_SAVING_MOVEMENT_UNASSIGNED_EMPLOYEE) {
      return t('cooperative.savingMovementReport.unassignedEmployee');
    }

    return selectedEmployee ? getEmployeeLabel(selectedEmployee) : employeeId;
  })();
  const savingTypeText = savingType ? savingTypeLabel(savingType) : t('cooperative.savingMovementReport.allSavingTypes');
  const employeeOptions = useMemo(() => [
    { value: ALL_VALUE, label: t('cooperative.savingMovementReport.allEmployees') },
    {
      value: COOPERATIVE_SAVING_MOVEMENT_UNASSIGNED_EMPLOYEE,
      label: t('cooperative.savingMovementReport.unassignedEmployee'),
    },
    ...(report?.employeeOptions ?? []).map((employee) => ({
      value: employee.id,
      label: getEmployeeLabel(employee),
    })),
  ], [report?.employeeOptions, t]);
  const savingTypeOptions = [
    { value: ALL_VALUE, label: t('cooperative.savingMovementReport.allSavingTypes') },
    ...savingTypeValues.map((value) => ({
      value,
      label: savingTypeLabel(value),
    })),
  ];
  const labels = {
    month: t('cooperative.savingMovementReport.month'),
    employee: t('cooperative.savingMovementReport.employee'),
    savingType: t('cooperative.savingMovementReport.savingType'),
    date: t('cooperative.reports.table.date'),
    time: t('cooperative.savingMovementReport.time'),
    day: t('cooperative.savingMovementReport.day'),
    member: t('cooperative.reports.table.member'),
    officer: t('cooperative.reports.table.officer'),
    cashAccount: t('cooperative.reports.table.cashAccount'),
    withdrawalSource: t('cooperative.savingMovementReport.withdrawalSource'),
    notes: t('cooperative.savingMovementReport.notes'),
    amount: t('cooperative.reports.table.amount'),
  };

  const buildCsvRows = (): ExportRows => {
    if (!report) return [];

    const rows: ExportRows = [
      [title, printDateText],
      [labels.month, monthText],
      [labels.employee, employeeText],
      [labels.savingType, savingTypeText],
      [t('common.total'), report.summary.row_count, report.summary.total_amount],
    ];
    const pushGroup = (group: CooperativeSavingMovementReportGroup) => {
      rows.push([]);
      rows.push([`${formatDateDot(group.date_key)} - ${formatDayName(group.date_key)}`, group.summary.total_amount]);
      rows.push([
        labels.date,
        labels.time,
        labels.day,
        labels.member,
        labels.officer,
        labels.savingType,
        labels.cashAccount,
        labels.withdrawalSource,
        labels.notes,
        labels.amount,
      ]);
      group.rows.forEach((row) => {
        rows.push([
          formatDateDot(row.transaction_date),
          formatTimeText(row.transaction_date),
          formatDayName(row.transaction_date),
          `${row.member_number} - ${row.member_name}`,
          row.employee_name
            ? row.employee_position
              ? `${row.employee_name} - ${row.employee_position}`
              : row.employee_name
            : t('cooperative.savingMovementReport.unassignedEmployee'),
          savingTypeLabel(row.saving_type),
          row.cash_account_code
            ? `${row.cash_account_code} - ${row.cash_account_name ?? ''}`.trim()
            : row.cash_account_name ?? '-',
          withdrawalSourceLabel(row),
          row.notes || row.payment_channel || '',
          row.amount,
        ]);
      });
      rows.push([
        t('common.total'),
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        group.summary.row_count,
        group.summary.total_amount,
      ]);
    };

    report.groups.forEach(pushGroup);
    return rows;
  };

  const buildHtmlDocument = () => {
    const reportHtml = reportRef.current?.outerHTML;

    return `<!doctype html>
<html lang="${locale}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
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

  const handleExportCsv = async (target: ExportTarget = 'auto') => {
    if (!report) return;
    try {
      const exported = await exportCsv({
        filename: `${exportFilenameBase}.csv`,
        rows: buildCsvRows(),
        target,
      });
      if (!exported) return;
      message.success(t('cooperative.savingMovementReport.exportCsvSuccess'));
    } catch (error) {
      console.error('Failed to export cooperative saving movement CSV:', error);
      message.error(t('cooperative.savingMovementReport.exportCsvFailed'));
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
      message.success(t('cooperative.savingMovementReport.exportHtmlSuccess'));
    } catch (error) {
      console.error('Failed to export cooperative saving movement HTML:', error);
      message.error(t('cooperative.savingMovementReport.exportHtmlFailed'));
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
      message.success(t('cooperative.savingMovementReport.exportPdfSuccess'));
    } catch (error) {
      console.error('Failed to export cooperative saving movement PDF:', error);
      message.error(t('cooperative.savingMovementReport.exportPdfFailed'));
    }
  };

  return (
    <div className="space-y-4 p-3 sm:p-4 md:p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <Title level={2} className="!mb-1 flex items-center gap-2">
            <FileText size={24} />
            {title}
          </Title>
          <Text type="secondary">{subtitle}</Text>
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

      <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(180px,260px)_minmax(220px,340px)_minmax(180px,260px)]">
        <div>
          <Text strong>{labels.month}</Text>
          <div data-testid="koperasi-saving-movement-month-filter">
            <DatePicker
              className="mt-2 w-full"
              picker="month"
              value={selectedMonth}
              format="MMMM YYYY"
              onChange={(value) => setSelectedMonth(value?.startOf('month') ?? dayjs().tz().startOf('month'))}
            />
          </div>
        </div>
        <div>
          <Text strong>{labels.employee}</Text>
          <div data-testid="koperasi-saving-movement-employee-filter">
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
        <div>
          <Text strong>{labels.savingType}</Text>
          <div data-testid="koperasi-saving-movement-type-filter">
            <Select
              className="mt-2 w-full"
              value={savingType ?? ALL_VALUE}
              options={savingTypeOptions}
              onChange={(value) => setSavingType(value === ALL_VALUE ? undefined : value as CooperativeSavingType)}
            />
          </div>
        </div>
      </div>

      {!isLoading && !hasRows ? (
        <Empty description={emptyText} />
      ) : null}

      <div style={{ overflowX: 'auto' }}>
        <CooperativeSavingMovementReport
          ref={reportRef}
          data={report}
          companyName={companyName}
          logoDataUrl={profile?.logo_data_url}
          direction={direction}
          monthText={monthText}
          employeeText={employeeText}
          savingTypeText={savingTypeText}
          printDateText={printDateText}
        />
      </div>
    </div>
  );
}
