import { useMemo, useRef, useState } from 'react';
import { FilePdfOutlined, FileTextOutlined } from '@ant-design/icons';
import { App, Alert, Button, DatePicker, Empty, Select, Space, Typography } from 'antd';
import type { Dayjs } from 'dayjs';
import { FileText, RefreshCw } from 'lucide-react';
import ExportActions from '@/components/ExportActions';
import { useCompanyProfileSetting } from '@/hooks/useCompanyProfileSetting';
import {
  useCooperativeDailyTargetReport,
  type CooperativeDailyTargetReportFilters,
} from '@/hooks/useCooperativeDailyTargetReport';
import { useI18n } from '@/hooks/useI18n';
import dayjs from '@/lib/dayjs';
import {
  COOPERATIVE_DAILY_TARGET_UNASSIGNED_EMPLOYEE,
  type CooperativeDailyTargetEmployeeOption,
  type CooperativeDailyTargetReportGroup,
  type CooperativeDailyTargetReportSummary,
} from '@/services/cooperativeDailyTargetReportService';
import { getCollectionWeekdayLabel } from '@/utils/koperasi/collectionSchedule';
import {
  exportCsv,
  exportHtmlPdf,
  saveExportFile,
  type ExportRows,
  type ExportTarget,
} from '@/utils/export';
import CooperativeDailyTargetReport from './CooperativeDailyTargetReport';

const { Text, Title } = Typography;
const ALL_VALUE = '__ALL__';

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}[char] ?? char));

const employeeLabel = (
  employee: Pick<CooperativeDailyTargetEmployeeOption, 'name' | 'position'>,
) => employee.position ? `${employee.name} - ${employee.position}` : employee.name;

const groupEmployeeLabel = (
  group: Pick<CooperativeDailyTargetReportGroup, 'employee_name' | 'employee_position'>,
  unassignedLabel: string,
) => {
  if (!group.employee_name) return unassignedLabel;
  return group.employee_position
    ? `${group.employee_name} - ${group.employee_position}`
    : group.employee_name;
};

const summaryCells = (summary: CooperativeDailyTargetReportSummary) => [
  summary.old_member_count,
  summary.new_member_count,
  summary.exit_member_count,
  summary.ending_member_count,
  summary.opening_target_amount,
  summary.incoming_installment_amount,
  summary.outgoing_installment_amount,
  summary.ending_target_amount,
  summary.storting_amount,
  summary.achievement_percentage,
  summary.drop_margin_amount,
  '',
  summary.current_drop_amount,
  summary.running_drop_amount,
  summary.running_storting_amount,
  summary.saving_withdrawal_amount,
  summary.cash_amount,
];

export default function CooperativeDailyTargetReportManagement() {
  const { message } = App.useApp();
  const { t, locale } = useI18n();
  const { profile } = useCompanyProfileSetting();
  const reportRef = useRef<HTMLDivElement | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<Dayjs>(() => dayjs().tz().startOf('month'));
  const [employeeId, setEmployeeId] = useState<string | undefined>();
  const filters = useMemo<CooperativeDailyTargetReportFilters>(() => ({
    monthDate: selectedMonth.startOf('month').toISOString(),
    employeeId,
  }), [employeeId, selectedMonth]);
  const reportQuery = useCooperativeDailyTargetReport(filters);
  const report = reportQuery.data;
  const isLoading = reportQuery.isLoading || reportQuery.isFetching;
  const hasRows = Boolean(report?.rows.length);
  const companyName = profile?.company_name || t('cooperative.ledger.companyFallback');
  const printDateText = dayjs().tz().format('YYYY-MM-DD HH:mm:ss');
  const monthText = selectedMonth.format('MMMM YYYY').toUpperCase();
  const selectedEmployee = report?.employeeOptions.find((employee) => employee.id === employeeId);
  const employeeText = (() => {
    if (!employeeId) return t('cooperative.reports.dailyTarget.allEmployees');
    if (employeeId === COOPERATIVE_DAILY_TARGET_UNASSIGNED_EMPLOYEE) {
      return t('cooperative.memberRegister.unassignedEmployee');
    }
    return selectedEmployee ? employeeLabel(selectedEmployee) : employeeId;
  })();
  const employeeOptions = useMemo(() => [
    { value: ALL_VALUE, label: t('cooperative.reports.dailyTarget.allEmployees') },
    {
      value: COOPERATIVE_DAILY_TARGET_UNASSIGNED_EMPLOYEE,
      label: t('cooperative.memberRegister.unassignedEmployee'),
    },
    ...(report?.employeeOptions ?? []).map((employee) => ({
      value: employee.id,
      label: employeeLabel(employee),
    })),
  ], [report?.employeeOptions, t]);

  const columnHeaders = [
    t('cooperative.reports.dailyTarget.day'),
    t('cooperative.reports.dailyTarget.oldMember'),
    t('cooperative.reports.dailyTarget.newMember'),
    t('cooperative.reports.dailyTarget.exitMember'),
    t('cooperative.reports.dailyTarget.total'),
    t('cooperative.reports.dailyTarget.openingTarget'),
    t('cooperative.reports.dailyTarget.incomingInstallment'),
    t('cooperative.reports.dailyTarget.outgoingInstallment'),
    t('cooperative.reports.dailyTarget.endingTarget'),
    t('cooperative.reports.dailyTarget.storting'),
    t('cooperative.reports.dailyTarget.percentage'),
    t('cooperative.reports.dailyTarget.dropMargin'),
    t('cooperative.reports.dailyTarget.previousDrop'),
    t('cooperative.reports.dailyTarget.currentDrop'),
    t('cooperative.reports.dailyTarget.runningDrop'),
    t('cooperative.reports.dailyTarget.runningStorting'),
    t('cooperative.reports.dailyTarget.savingWithdrawal'),
    t('cooperative.reports.dailyTarget.cash'),
  ];

  const buildCsvRows = (): ExportRows => {
    if (!report) return [];
    const rows: ExportRows = [
      [t('cooperative.reports.dailyTarget.title')],
      [t('cooperative.reports.dailyTarget.month'), monthText],
      [t('cooperative.reports.dailyTarget.employee'), employeeText],
      [t('report.printDate'), printDateText],
    ];

    report.groups.forEach((group) => {
      rows.push([]);
      rows.push([
        t('cooperative.reports.dailyTarget.employee'),
        groupEmployeeLabel(group, t('cooperative.memberRegister.unassignedEmployee')),
      ]);
      rows.push([
        t('cooperative.reports.dailyTarget.areas'),
        group.area_names.join(', ') || '-',
      ]);
      group.collection_schedules.forEach((schedule) => {
        rows.push([
          t('cooperative.reports.dailyTarget.schedule'),
          getCollectionWeekdayLabel(schedule.weekday),
          schedule.area_names.join(', ') || '-',
        ]);
      });
      rows.push(columnHeaders);
      group.weeks.forEach((week) => {
        week.rows.forEach((row) => rows.push([
          `${dayjs(row.date_key).tz().format('dddd').toUpperCase()} ${dayjs(row.date_key).tz().format('DD.MM.YYYY')}`,
          row.old_member_count,
          row.new_member_count,
          row.exit_member_count,
          row.ending_member_count,
          row.opening_target_amount,
          row.incoming_installment_amount,
          row.outgoing_installment_amount,
          row.ending_target_amount,
          row.storting_amount,
          row.achievement_percentage,
          row.drop_margin_amount,
          row.previous_drop_amount,
          row.current_drop_amount,
          row.running_drop_amount,
          row.running_storting_amount,
          row.saving_withdrawal_amount,
          row.cash_amount,
        ]));
        rows.push([
          `${t('cooperative.reports.dailyTarget.weekTotal')} ${week.week_index}`,
          ...summaryCells(week.summary),
        ]);
      });
      rows.push([t('common.total'), ...summaryCells(group.summary)]);
    });

    if (report.groups.length > 1) {
      rows.push([]);
      rows.push([
        t('cooperative.reports.dailyTarget.grandTotal'),
        ...summaryCells(report.summary),
      ]);
    }

    return rows;
  };

  const buildHtmlDocument = () => `<!doctype html>
<html lang="${locale}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(t('cooperative.reports.dailyTarget.title'))}</title>
  <style>
    @page { size: A4 landscape; margin: 8mm; }
    * { box-sizing: border-box; }
    body { margin: 0; padding: 16px; background: #ffffff; color: #111827; font-family: Arial, sans-serif; }
    .report-shell { margin: 0 auto; width: max-content; }
    @media print { body { padding: 0; background: #ffffff; } }
  </style>
</head>
<body>
  <main class="report-shell">${reportRef.current?.outerHTML ?? ''}</main>
</body>
</html>`;

  const exportFilenameBase = `laporan-target-harian-${selectedMonth.format('YYYY-MM')}`;

  const handleExportCsv = async (target: ExportTarget = 'auto') => {
    if (!report) return;
    try {
      const exported = await exportCsv({
        filename: `${exportFilenameBase}.csv`,
        rows: buildCsvRows(),
        target,
      });
      if (exported) message.success(t('cooperative.reports.dailyTarget.exportCsvSuccess'));
    } catch (error) {
      console.error('Failed to export daily target CSV:', error);
      message.error(t('cooperative.reports.dailyTarget.exportCsvFailed'));
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
      if (exported) message.success(t('cooperative.reports.dailyTarget.exportHtmlSuccess'));
    } catch (error) {
      console.error('Failed to export daily target HTML:', error);
      message.error(t('cooperative.reports.dailyTarget.exportHtmlFailed'));
    }
  };

  const handleExportPdf = async (target: ExportTarget = 'auto') => {
    if (!report || !reportRef.current) return;
    try {
      const exported = await exportHtmlPdf({
        filename: `${exportFilenameBase}.pdf`,
        element: reportRef.current,
        orientation: 'landscape',
        pageMargin: 18,
        target,
      });
      if (exported) message.success(t('cooperative.reports.dailyTarget.exportPdfSuccess'));
    } catch (error) {
      console.error('Failed to export daily target PDF:', error);
      message.error(t('cooperative.reports.dailyTarget.exportPdfFailed'));
    }
  };

  return (
    <div className="space-y-4 p-3 sm:p-4 md:p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <Title level={2} className="!mb-1 flex items-center gap-2">
            <FileText size={24} />
            {t('cooperative.reports.dailyTarget.title')}
          </Title>
          <Text type="secondary">{t('cooperative.reports.dailyTarget.subtitle')}</Text>
        </div>
        <Space wrap>
          <Button
            icon={<RefreshCw size={16} />}
            loading={isLoading}
            onClick={() => void reportQuery.refetch()}
          >
            {t('common.refresh')}
          </Button>
          <ExportActions
            buttonType="default"
            disabled={!hasRows}
            formats={[
              { key: 'pdf', label: 'PDF', icon: <FilePdfOutlined />, onExport: handleExportPdf },
              { key: 'html', label: 'HTML', icon: <FileTextOutlined />, onExport: handleExportHtml },
              { key: 'csv', label: 'CSV', icon: <FileTextOutlined />, onExport: handleExportCsv },
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

      <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(180px,260px)_minmax(220px,340px)]">
        <div>
          <Text strong>{t('cooperative.reports.dailyTarget.month')}</Text>
          <DatePicker
            className="mt-2 w-full"
            picker="month"
            value={selectedMonth}
            format="MMMM YYYY"
            onChange={(value) => setSelectedMonth(value?.startOf('month') ?? dayjs().tz().startOf('month'))}
          />
        </div>
        <div>
          <Text strong>{t('cooperative.reports.dailyTarget.employee')}</Text>
          <Select
            data-testid="koperasi-daily-target-employee-filter"
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
        <Empty description={t('cooperative.reports.dailyTarget.empty')} />
      ) : null}

      <div style={{ overflowX: 'auto' }}>
        <CooperativeDailyTargetReport
          ref={reportRef}
          data={report}
          companyName={companyName}
          logoDataUrl={profile?.logo_data_url}
          monthText={monthText}
          employeeText={employeeText}
          printDateText={printDateText}
        />
      </div>
    </div>
  );
}
