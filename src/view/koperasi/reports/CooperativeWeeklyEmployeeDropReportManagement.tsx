import { useMemo, useRef, useState } from 'react';
import { FilePdfOutlined, FileTextOutlined } from '@ant-design/icons';
import { App, Alert, Button, DatePicker, Empty, Space, Typography } from 'antd';
import type { Dayjs } from 'dayjs';
import { FileText, RefreshCw } from 'lucide-react';
import ExportActions from '@/components/ExportActions';
import { useCompanyProfileSetting } from '@/hooks/useCompanyProfileSetting';
import { useCooperativeWeeklyEmployeeDropReport } from '@/hooks/useCooperativeWeeklyEmployeeDropReport';
import { useI18n } from '@/hooks/useI18n';
import dayjs from '@/lib/dayjs';
import type {
  CooperativeWeeklyEmployeeDropReportGroup,
  CooperativeWeeklyEmployeeDropReportWeek,
} from '@/services/cooperativeWeeklyEmployeeDropReportService';
import { exportCsv, exportHtmlPdf, saveExportFile, type ExportRows, type ExportTarget } from '@/utils/export';
import CooperativeWeeklyEmployeeDropReport from './CooperativeWeeklyEmployeeDropReport';

const { Text, Title } = Typography;

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

const formatDayName = (value: string) => dayjs(value).tz().format('dddd');

const formatWeekRange = (
  week: Pick<CooperativeWeeklyEmployeeDropReportWeek, 'start_date_key' | 'end_date_key'>,
) => {
  const startDate = formatDateDot(week.start_date_key);
  const endDate = formatDateDot(week.end_date_key);

  return startDate === endDate ? startDate : `${startDate} - ${endDate}`;
};

const getOfficerLabel = (
  group: Pick<CooperativeWeeklyEmployeeDropReportGroup, 'officer_name' | 'officer_position'>,
  unassignedLabel: string,
) => {
  if (!group.officer_name) return unassignedLabel;

  return group.officer_position ? `${group.officer_name} - ${group.officer_position}` : group.officer_name;
};

export default function CooperativeWeeklyEmployeeDropReportManagement() {
  const { message } = App.useApp();
  const { t, locale } = useI18n();
  const { profile } = useCompanyProfileSetting();
  const reportRef = useRef<HTMLDivElement | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<Dayjs>(() => dayjs().tz().startOf('month'));
  const filters = useMemo(() => ({
    monthDate: selectedMonth.startOf('month').toISOString(),
  }), [selectedMonth]);
  const reportQuery = useCooperativeWeeklyEmployeeDropReport(filters);
  const report = reportQuery.data;
  const isLoading = reportQuery.isLoading || reportQuery.isFetching;
  const hasRows = Boolean(report?.rows.length);
  const companyName = profile?.company_name || t('cooperative.ledger.companyFallback');
  const printDateText = dayjs().tz().format('YYYY-MM-DD HH:mm:ss');
  const periodText = selectedMonth.format('MMMM YYYY');

  const labels = {
    title: t('cooperative.reports.weeklyEmployeeDrop.title'),
    period: t('cooperative.ledger.period'),
    week: t('cooperative.reports.weeklyEmployeeDrop.week'),
    employee: t('cooperative.reports.weeklyEmployeeDrop.employee'),
    date: t('cooperative.reports.table.date'),
    day: t('cooperative.reports.dailyDrop.day'),
    memberCode: t('cooperative.reports.dailyDrop.memberCode'),
    principal: t('cooperative.reports.dailyDrop.principalDrop'),
    net: t('cooperative.reports.dailyDrop.netDrop'),
    service: t('cooperative.reports.dailyDrop.serviceDrop'),
    admin: t('cooperative.reports.dailyDrop.adminFee'),
    tab: t('cooperative.reports.dailyDrop.mandatorySaving'),
    totalDrop: t('cooperative.reports.dailyDrop.totalDrop'),
  };

  const buildCsvRows = (): ExportRows => {
    if (!report) return [];

    const rows: ExportRows = [
      [labels.title, printDateText],
      [labels.period, periodText],
      [
        t('common.total'),
        report.summary.old_member_count,
        report.summary.new_member_count,
        report.summary.exit_member_count,
        report.summary.principal_amount,
        report.summary.net_disbursement_amount,
        report.summary.loan_service_amount,
        report.summary.admin_fee_amount,
        report.summary.mandatory_saving_amount,
        report.summary.total_payable_amount,
      ],
    ];

    report.weeks.forEach((week) => {
      rows.push([]);
      rows.push([
        `${labels.week} ${week.week_index}`,
        formatWeekRange(week),
        week.summary.old_member_count,
        week.summary.new_member_count,
        week.summary.exit_member_count,
        week.summary.total_payable_amount,
      ]);

      week.groups.forEach((group) => {
        rows.push([]);
        rows.push([
          labels.employee,
          getOfficerLabel(group, t('cooperative.memberRegister.unassignedEmployee')),
          group.summary.row_count,
          group.summary.net_disbursement_amount,
          group.summary.total_payable_amount,
        ]);
        rows.push([
          labels.date,
          labels.day,
          'L',
          'B',
          'K',
          labels.memberCode,
          labels.principal,
          labels.net,
          labels.service,
          labels.admin,
          labels.tab,
          labels.totalDrop,
        ]);
        group.rows.forEach((row) => {
          rows.push([
            formatDateDot(row.event_date),
            formatDayName(row.event_date),
            row.old_member_count || '',
            row.new_member_count || '',
            row.exit_member_count || '',
            `${row.member_number} - ${row.member_name}`,
            row.principal_amount,
            row.net_disbursement_amount,
            row.loan_service_amount,
            row.admin_fee_amount,
            row.mandatory_saving_amount,
            row.total_payable_amount,
          ]);
        });
        rows.push([
          t('common.total'),
          '',
          group.summary.old_member_count,
          group.summary.new_member_count,
          group.summary.exit_member_count,
          group.summary.row_count,
          group.summary.principal_amount,
          group.summary.net_disbursement_amount,
          group.summary.loan_service_amount,
          group.summary.admin_fee_amount,
          group.summary.mandatory_saving_amount,
          group.summary.total_payable_amount,
        ]);
      });
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

  const exportFilenameBase = `laporan-drop-mingguan-${selectedMonth.format('YYYY-MM')}`;

  const handleExportCsv = async (target: ExportTarget = 'auto') => {
    if (!report) return;
    try {
      const exported = await exportCsv({
        filename: `${exportFilenameBase}.csv`,
        rows: buildCsvRows(),
        target,
      });
      if (!exported) return;
      message.success(t('cooperative.reports.weeklyEmployeeDrop.exportCsvSuccess'));
    } catch (error) {
      console.error('Failed to export weekly employee drop CSV:', error);
      message.error(t('cooperative.reports.weeklyEmployeeDrop.exportCsvFailed'));
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
      message.success(t('cooperative.reports.weeklyEmployeeDrop.exportHtmlSuccess'));
    } catch (error) {
      console.error('Failed to export weekly employee drop HTML:', error);
      message.error(t('cooperative.reports.weeklyEmployeeDrop.exportHtmlFailed'));
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
      message.success(t('cooperative.reports.weeklyEmployeeDrop.exportPdfSuccess'));
    } catch (error) {
      console.error('Failed to export weekly employee drop PDF:', error);
      message.error(t('cooperative.reports.weeklyEmployeeDrop.exportPdfFailed'));
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
          <Text type="secondary">{t('cooperative.reports.weeklyEmployeeDrop.subtitle')}</Text>
        </div>
        <Space wrap>
          <DatePicker
            allowClear={false}
            picker="month"
            value={selectedMonth}
            onChange={(value) => {
              if (value) setSelectedMonth(value.startOf('month'));
            }}
          />
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

      {!isLoading && !hasRows ? (
        <Empty description={t('cooperative.reports.weeklyEmployeeDrop.empty')} />
      ) : null}

      <div style={{ overflowX: 'auto' }}>
        <CooperativeWeeklyEmployeeDropReport
          ref={reportRef}
          data={report}
          companyName={companyName}
          logoDataUrl={profile?.logo_data_url}
          periodText={periodText}
          printDateText={printDateText}
        />
      </div>
    </div>
  );
}
