import { useMemo, useRef, useState } from 'react';
import { FilePdfOutlined, FileTextOutlined } from '@ant-design/icons';
import { App, Alert, Button, DatePicker, Empty, Select, Space, Typography } from 'antd';
import type { Dayjs } from 'dayjs';
import { FileText, RefreshCw } from 'lucide-react';
import ExportActions from '@/components/ExportActions';
import { useCompanyProfileSetting } from '@/hooks/useCompanyProfileSetting';
import {
  useCooperativeDailyStortingReport,
  type CooperativeDailyStortingReportFilters,
} from '@/hooks/useCooperativeDailyStortingReport';
import { useI18n } from '@/hooks/useI18n';
import dayjs from '@/lib/dayjs';
import {
  COOPERATIVE_DAILY_STORTING_UNASSIGNED_EMPLOYEE,
  type CooperativeDailyStortingEmployeeOption,
  type CooperativeDailyStortingReportGroup,
  type CooperativeDailyStortingReportWeek,
} from '@/services/cooperativeDailyStortingReportService';
import { exportCsv, exportHtmlPdf, saveExportFile, type ExportRows, type ExportTarget } from '@/utils/export';
import CooperativeDailyStortingReport from './CooperativeDailyStortingReport';

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

const formatWeekRange = (
  week: Pick<CooperativeDailyStortingReportWeek, 'start_date_key' | 'end_date_key'>,
) => {
  const startDate = formatDateDot(week.start_date_key);
  const endDate = formatDateDot(week.end_date_key);

  return startDate === endDate ? startDate : `${startDate} - ${endDate}`;
};

const getCollectorLabel = (
  employee: Pick<CooperativeDailyStortingEmployeeOption, 'name' | 'position'>,
) => employee.position ? `${employee.name} - ${employee.position}` : employee.name;

const getGroupCollectorLabel = (
  group: Pick<CooperativeDailyStortingReportGroup, 'employee_name' | 'employee_position'>,
  unassignedLabel: string,
) => {
  if (!group.employee_name) return unassignedLabel;

  return group.employee_position ? `${group.employee_name} - ${group.employee_position}` : group.employee_name;
};

export default function CooperativeDailyStortingReportManagement() {
  const { message } = App.useApp();
  const { t, locale } = useI18n();
  const { profile } = useCompanyProfileSetting();
  const reportRef = useRef<HTMLDivElement | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<Dayjs>(() => dayjs().tz().startOf('month'));
  const [employeeId, setEmployeeId] = useState<string | undefined>();
  const filters = useMemo<CooperativeDailyStortingReportFilters>(() => ({
    monthDate: selectedMonth.startOf('month').toISOString(),
    employeeId,
  }), [employeeId, selectedMonth]);
  const reportQuery = useCooperativeDailyStortingReport(filters);
  const report = reportQuery.data;
  const isLoading = reportQuery.isLoading || reportQuery.isFetching;
  const hasRows = Boolean(report?.rows.length);
  const companyName = profile?.company_name || t('cooperative.ledger.companyFallback');
  const printDateText = dayjs().tz().format('YYYY-MM-DD HH:mm:ss');
  const monthText = selectedMonth.format('MMMM YYYY').toUpperCase();
  const selectedEmployee = report?.employeeOptions?.find((employee) => employee.id === employeeId);
  const collectorText = (() => {
    if (!employeeId) return t('cooperative.reports.dailyStorting.allCollectors');
    if (employeeId === COOPERATIVE_DAILY_STORTING_UNASSIGNED_EMPLOYEE) {
      return t('cooperative.memberRegister.unassignedEmployee');
    }

    return selectedEmployee ? getCollectorLabel(selectedEmployee) : employeeId;
  })();
  const employeeOptions = useMemo(() => [
    { value: ALL_VALUE, label: t('cooperative.reports.dailyStorting.allCollectors') },
    {
      value: COOPERATIVE_DAILY_STORTING_UNASSIGNED_EMPLOYEE,
      label: t('cooperative.memberRegister.unassignedEmployee'),
    },
    ...(report?.employeeOptions ?? []).map((employee) => ({
      value: employee.id,
      label: getCollectorLabel(employee),
    })),
  ], [report?.employeeOptions, t]);

  const labels = {
    title: t('cooperative.reports.dailyStorting.title'),
    month: t('cooperative.reports.dailyStorting.month'),
    collector: t('cooperative.reports.dailyStorting.collector'),
    areas: t('cooperative.reports.dailyStorting.areas'),
    date: t('cooperative.reports.table.date'),
    day: t('cooperative.reports.dailyStorting.day'),
    storting: t('cooperative.reports.dailyStorting.storting'),
    dropMargin: t('cooperative.reports.dailyStorting.dropMargin'),
    drop: t('cooperative.reports.dailyStorting.drop'),
    savingWithdrawal: t('cooperative.reports.dailyStorting.savingWithdrawal'),
    iptw: t('cooperative.reports.dailyStorting.iptw'),
    cash: t('cooperative.reports.dailyStorting.cash'),
  };

  const buildCsvRows = (): ExportRows => {
    if (!report) return [];

    const rows: ExportRows = [
      [labels.title, printDateText],
      [labels.month, monthText],
      [labels.collector, collectorText],
      [
        t('common.total'),
        report.summary.storting_amount,
        report.summary.drop_margin_amount,
        report.summary.drop_amount,
        report.summary.saving_withdrawal_amount,
        report.summary.iptw_amount,
        report.summary.cash_amount,
      ],
    ];

    (report.groups ?? []).forEach((group) => {
      rows.push([]);
      rows.push([
        labels.collector,
        getGroupCollectorLabel(group, t('cooperative.memberRegister.unassignedEmployee')),
      ]);
      rows.push([labels.areas, group.area_names.join(', ') || '-']);

      group.weeks.forEach((week) => {
        rows.push([]);
        rows.push([
          `${t('cooperative.reports.weeklyEmployeeDrop.week')} ${week.week_index}`,
          formatWeekRange(week),
        ]);
        rows.push([
          labels.date,
          labels.day,
          labels.storting,
          labels.dropMargin,
          labels.drop,
          labels.savingWithdrawal,
          labels.iptw,
          labels.cash,
        ]);
        week.rows.forEach((row) => {
          rows.push([
            formatDateDot(row.date_key),
            formatDayName(row.date_key),
            row.storting_amount,
            row.drop_margin_amount,
            row.drop_amount,
            row.saving_withdrawal_amount,
            row.iptw_amount,
            row.cash_amount,
          ]);
        });
        rows.push([
          t('common.total'),
          '',
          week.summary.storting_amount,
          week.summary.drop_margin_amount,
          week.summary.drop_amount,
          week.summary.saving_withdrawal_amount,
          week.summary.iptw_amount,
          week.summary.cash_amount,
        ]);
      });

      rows.push([
        t('common.total'),
        getGroupCollectorLabel(group, t('cooperative.memberRegister.unassignedEmployee')),
        group.summary.storting_amount,
        group.summary.drop_margin_amount,
        group.summary.drop_amount,
        group.summary.saving_withdrawal_amount,
        group.summary.iptw_amount,
        group.summary.cash_amount,
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

  const exportFilenameBase = `laporan-storting-harian-${selectedMonth.format('YYYY-MM')}`;

  const handleExportCsv = async (target: ExportTarget = 'auto') => {
    if (!report) return;
    try {
      const exported = await exportCsv({
        filename: `${exportFilenameBase}.csv`,
        rows: buildCsvRows(),
        target,
      });
      if (!exported) return;
      message.success(t('cooperative.reports.dailyStorting.exportCsvSuccess'));
    } catch (error) {
      console.error('Failed to export daily storting CSV:', error);
      message.error(t('cooperative.reports.dailyStorting.exportCsvFailed'));
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
      message.success(t('cooperative.reports.dailyStorting.exportHtmlSuccess'));
    } catch (error) {
      console.error('Failed to export daily storting HTML:', error);
      message.error(t('cooperative.reports.dailyStorting.exportHtmlFailed'));
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
      message.success(t('cooperative.reports.dailyStorting.exportPdfSuccess'));
    } catch (error) {
      console.error('Failed to export daily storting PDF:', error);
      message.error(t('cooperative.reports.dailyStorting.exportPdfFailed'));
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
          <Text type="secondary">{t('cooperative.reports.dailyStorting.subtitle')}</Text>
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

      <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(180px,260px)_minmax(220px,340px)]">
        <div>
          <Text strong>{labels.month}</Text>
          <DatePicker
            className="mt-2 w-full"
            picker="month"
            value={selectedMonth}
            format="MMMM YYYY"
            onChange={(value) => setSelectedMonth(value?.startOf('month') ?? dayjs().tz().startOf('month'))}
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
        <Empty description={t('cooperative.reports.dailyStorting.empty')} />
      ) : null}

      <div style={{ overflowX: 'auto' }}>
        <CooperativeDailyStortingReport
          ref={reportRef}
          data={report}
          companyName={companyName}
          logoDataUrl={profile?.logo_data_url}
          monthText={monthText}
          collectorText={collectorText}
          printDateText={printDateText}
        />
      </div>
    </div>
  );
}
