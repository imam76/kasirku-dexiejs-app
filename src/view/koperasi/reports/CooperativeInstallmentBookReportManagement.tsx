import { useMemo, useRef, useState } from 'react';
import {
  FileExcelOutlined,
  FilePdfOutlined,
  FileTextOutlined,
} from '@ant-design/icons';
import { App, Alert, Button, DatePicker, Empty, Select, Space, Typography } from 'antd';
import type { Dayjs } from 'dayjs';
import { BookOpen, RefreshCw } from 'lucide-react';
import ExportActions from '@/components/ExportActions';
import { useCompanyProfileSetting } from '@/hooks/useCompanyProfileSetting';
import { useCooperativeAreaScope } from '@/hooks/useCooperativeAreaScope';
import {
  useCooperativeInstallmentBookReport,
  type CooperativeInstallmentBookReportFilters,
} from '@/hooks/useCooperativeInstallmentBookReport';
import { useI18n } from '@/hooks/useI18n';
import dayjs from '@/lib/dayjs';
import {
  COOPERATIVE_INSTALLMENT_BOOK_UNASSIGNED_EMPLOYEE,
  type CooperativeInstallmentBookAgingCategory,
  type CooperativeInstallmentBookReportGroup,
} from '@/services/cooperativeInstallmentBookReportService';
import type { CooperativeCollectionWeekday } from '@/types';
import {
  exportCsv,
  exportHtmlPdf,
  exportXlsx,
  saveExportFile,
  type ExportRows,
  type ExportTarget,
} from '@/utils/export';
import {
  COOPERATIVE_COLLECTION_WEEKDAYS,
  getCollectionWeekdayLabel,
  getIsoWeekday,
} from '@/utils/koperasi/collectionSchedule';
import CooperativeInstallmentBookReport from './CooperativeInstallmentBookReport';

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

const getEmployeeLabel = (
  employee: { name: string; position?: string },
) => employee.position ? `${employee.name} - ${employee.position}` : employee.name;

const getGroupEmployeeLabel = (
  group: Pick<CooperativeInstallmentBookReportGroup, 'officer_name' | 'officer_position'>,
  unassignedLabel: string,
) => {
  if (!group.officer_name) return unassignedLabel;
  return group.officer_position
    ? `${group.officer_name} - ${group.officer_position}`
    : group.officer_name;
};

export default function CooperativeInstallmentBookReportManagement() {
  const { message } = App.useApp();
  const { t, locale } = useI18n();
  const { profile } = useCompanyProfileSetting();
  const areaScope = useCooperativeAreaScope();
  const reportRef = useRef<HTMLDivElement | null>(null);
  const [month, setMonth] = useState<Dayjs>(() => dayjs().tz().startOf('month'));
  const [collectionWeekday, setCollectionWeekday] = useState<CooperativeCollectionWeekday>(
    () => getIsoWeekday(dayjs().tz()),
  );
  const [employeeId, setEmployeeId] = useState<string>();
  const filters = useMemo<CooperativeInstallmentBookReportFilters>(() => ({
    monthDate: month.toISOString(),
    collectionWeekday,
    employeeId,
    visibleAreaIds: areaScope.isScoped ? areaScope.areaIds : undefined,
  }), [areaScope.areaIds, areaScope.isScoped, collectionWeekday, employeeId, month]);
  const reportQuery = useCooperativeInstallmentBookReport(filters);
  const report = reportQuery.data;
  const isLoading = reportQuery.isLoading || reportQuery.isFetching;
  const hasRows = Boolean(report?.summary.row_count);
  const companyName = profile?.company_name || t('cooperative.ledger.companyFallback');
  const printDateText = dayjs().tz().format('YYYY-MM-DD HH:mm:ss');
  const periodText = month.format('MMMM YYYY');
  const collectionWeekdayLabel = getCollectionWeekdayLabel(collectionWeekday);
  const reportFileStem = report
    ? `buku-angsuran-${report.month_key}-${getCollectionWeekdayLabel(
      report.collection_weekday,
    ).toLowerCase()}`
    : 'buku-angsuran';
  const categoryLabels: Record<CooperativeInstallmentBookAgingCategory, string> = {
    CURRENT: t('cooperative.installmentBook.category.current'),
    WATCHLIST: t('cooperative.installmentBook.category.watchlist'),
    DELINQUENT: t('cooperative.installmentBook.category.delinquent'),
  };
  const labels = {
    title: t('cooperative.installmentBook.title'),
    resort: t('cooperative.installmentBook.resort'),
    date: t('cooperative.installmentBook.table.date'),
    memberNumber: t('cooperative.installmentBook.table.memberNumber'),
    name: t('cooperative.installmentBook.table.name'),
    principal: t('cooperative.installmentBook.table.principal'),
    openingBalance: t('cooperative.installmentBook.table.openingBalance'),
    collectionDay: t('cooperative.installmentBook.table.collectionDay', {
      day: collectionWeekdayLabel,
    }),
    installment: t('cooperative.installmentBook.table.installment'),
    endingBalance: t('cooperative.installmentBook.table.endingBalance'),
  };
  const employeeOptions = useMemo(() => [
    { value: ALL_VALUE, label: t('cooperative.installmentBook.allResorts') },
    ...(!areaScope.isScoped ? [{
      value: COOPERATIVE_INSTALLMENT_BOOK_UNASSIGNED_EMPLOYEE,
      label: t('cooperative.installmentBook.unassignedResort'),
    }] : []),
    ...(report?.employeeOptions ?? []).map((employee) => ({
      value: employee.id,
      label: getEmployeeLabel(employee),
    })),
  ], [areaScope.isScoped, report?.employeeOptions, t]);
  const collectionWeekdayOptions = COOPERATIVE_COLLECTION_WEEKDAYS.map((weekday) => ({
    value: weekday,
    label: getCollectionWeekdayLabel(weekday),
  }));

  const buildGroupRows = (
    group: CooperativeInstallmentBookReportGroup,
  ): ExportRows => {
    const collectionDays = group.collection_dates;
    const rows: ExportRows = [
      [labels.title],
      [t('cooperative.ledger.period'), periodText],
      [labels.resort, getGroupEmployeeLabel(group, t('cooperative.installmentBook.unassignedResort'))],
      [t('cooperative.installmentBook.areas'), group.area_names.join(', ') || '-'],
    ];

    group.sections.forEach((section) => {
      rows.push([]);
      rows.push([categoryLabels[section.category]]);
      rows.push([
        labels.date,
        labels.memberNumber,
        'L/B',
        labels.name,
        labels.principal,
        labels.openingBalance,
        ...collectionDays.map((day) => `${labels.collectionDay} ${day}`),
        labels.installment,
        labels.endingBalance,
      ]);
      section.rows.forEach((row) => {
        rows.push([
          dayjs(row.loan_date).tz().format('YYYY-MM-DD'),
          row.member_number,
          row.member_category,
          row.member_name,
          row.principal_amount,
          row.opening_balance,
          ...collectionDays.map((day) => row.payment_by_collection_date[day] ?? 0),
          row.installment_amount,
          row.ending_balance,
        ]);
      });
      rows.push([
        t('common.total'),
        section.summary.row_count,
        '',
        '',
        section.summary.principal_amount,
        section.summary.opening_balance,
        ...collectionDays.map((day) => section.rows.reduce(
          (total, row) => total + (row.payment_by_collection_date[day] ?? 0),
          0,
        )),
        section.summary.installment_amount,
        section.summary.ending_balance,
      ]);
    });

    return rows;
  };

  const buildCsvRows = (): ExportRows => {
    if (!report) return [];

    return report.groups.flatMap((group, index) => [
      ...(index > 0 ? [[]] : []),
      ...buildGroupRows(group),
    ]);
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
    @page { size: A4 landscape; margin: 8mm; }
    * { box-sizing: border-box; }
    body { margin: 0; background: #f3f4f6; color: #111827; font-family: Arial, sans-serif; padding: 20px; }
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
        filename: `${reportFileStem}.csv`,
        rows: buildCsvRows(),
        target,
      });
      if (!exported) return;
      message.success(t('cooperative.installmentBook.exportCsvSuccess'));
    } catch (error) {
      console.error('Failed to export installment book CSV:', error);
      message.error(t('cooperative.installmentBook.exportCsvFailed'));
    }
  };

  const handleExportExcel = async (target: ExportTarget = 'auto') => {
    if (!report) return;
    try {
      const exported = await exportXlsx({
        filename: `${reportFileStem}.xlsx`,
        target,
        sheets: report.groups.map((group, index) => ({
          name: getGroupEmployeeLabel(
            group,
            `${t('cooperative.installmentBook.unassignedResort')} ${index + 1}`,
          ),
          rows: buildGroupRows(group),
        })),
      });
      if (!exported) return;
      message.success(t('cooperative.installmentBook.exportExcelSuccess'));
    } catch (error) {
      console.error('Failed to export installment book Excel:', error);
      message.error(t('cooperative.installmentBook.exportExcelFailed'));
    }
  };

  const handleExportHtml = async (target: ExportTarget = 'auto') => {
    if (!report || !reportRef.current) return;
    try {
      const exported = await saveExportFile({
        filename: `${reportFileStem}.html`,
        mimeType: 'text/html',
        content: buildHtmlDocument(),
        target,
      });
      if (!exported) return;
      message.success(t('cooperative.installmentBook.exportHtmlSuccess'));
    } catch (error) {
      console.error('Failed to export installment book HTML:', error);
      message.error(t('cooperative.installmentBook.exportHtmlFailed'));
    }
  };

  const handleExportPdf = async (target: ExportTarget = 'auto') => {
    if (!report || !reportRef.current) return;
    try {
      const exported = await exportHtmlPdf({
        filename: `${reportFileStem}.pdf`,
        element: reportRef.current,
        orientation: 'landscape',
        target,
      });
      if (!exported) return;
      message.success(t('cooperative.installmentBook.exportPdfSuccess'));
    } catch (error) {
      console.error('Failed to export installment book PDF:', error);
      message.error(t('cooperative.installmentBook.exportPdfFailed'));
    }
  };

  return (
    <div className="space-y-4 p-3 sm:p-4 md:p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <Title level={2} className="!mb-1 flex items-center gap-2">
            <BookOpen size={24} />
            {labels.title}
          </Title>
          <Text type="secondary">{t('cooperative.installmentBook.subtitle')}</Text>
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
            disabled={!hasRows}
            formats={[
              {
                key: 'pdf',
                label: 'PDF',
                icon: <FilePdfOutlined />,
                onExport: handleExportPdf,
              },
              {
                key: 'excel',
                label: 'Excel',
                icon: <FileExcelOutlined />,
                onExport: handleExportExcel,
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

      <Alert
        type="info"
        showIcon
        message={t('cooperative.installmentBook.agingRule')}
      />

      {reportQuery.error ? (
        <Alert
          type="error"
          showIcon
          message={reportQuery.error instanceof Error
            ? reportQuery.error.message
            : t('common.unknownError')}
        />
      ) : null}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div>
          <Text strong>{t('cooperative.installmentBook.month')}</Text>
          <DatePicker
            picker="month"
            className="mt-2 w-full"
            value={month}
            format="MMMM YYYY"
            onChange={(value) => {
              if (value) setMonth(value.startOf('month'));
            }}
          />
        </div>
        <div>
          <Text strong>{t('cooperative.installmentBook.collectionDayFilter')}</Text>
          <Select
            className="mt-2 w-full"
            value={collectionWeekday}
            options={collectionWeekdayOptions}
            onChange={(value: CooperativeCollectionWeekday) => setCollectionWeekday(value)}
          />
        </div>
        <div>
          <Text strong>{labels.resort}</Text>
          <Select
            showSearch
            optionFilterProp="label"
            className="mt-2 w-full"
            value={employeeId ?? ALL_VALUE}
            options={employeeOptions}
            onChange={(value: string) => setEmployeeId(value === ALL_VALUE ? undefined : value)}
          />
        </div>
      </div>

      {!isLoading && !hasRows ? (
        <Empty description={t('cooperative.installmentBook.empty')} />
      ) : null}

      <div style={{ overflowX: 'auto' }}>
        <CooperativeInstallmentBookReport
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
