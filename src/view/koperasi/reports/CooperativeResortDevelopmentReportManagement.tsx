import { useEffect, useMemo, useRef, useState } from 'react';
import { FilePdfOutlined, FileTextOutlined } from '@ant-design/icons';
import { App, Alert, Button, DatePicker, Empty, Input, Select, Space, Typography } from 'antd';
import type { Dayjs } from 'dayjs';
import { FileText, RefreshCw } from 'lucide-react';
import ExportActions from '@/components/ExportActions';
import { useCompanyProfileSetting } from '@/hooks/useCompanyProfileSetting';
import {
  useCooperativeResortDevelopmentReport,
  type CooperativeResortDevelopmentReportFilters,
} from '@/hooks/useCooperativeResortDevelopmentReport';
import { useI18n } from '@/hooks/useI18n';
import dayjs from '@/lib/dayjs';
import {
  COOPERATIVE_RESORT_DEVELOPMENT_UNASSIGNED_EMPLOYEE,
  type CooperativeResortDevelopmentEmployeeOption,
  type CooperativeResortDevelopmentReportGroup,
  type CooperativeResortDevelopmentReportRow,
  type CooperativeResortDevelopmentReportSummary,
} from '@/services/cooperativeResortDevelopmentReportService';
import {
  exportCsv,
  exportHtmlPdf,
  saveExportFile,
  type ExportRows,
  type ExportTarget,
} from '@/utils/export';
import CooperativeResortDevelopmentReport from './CooperativeResortDevelopmentReport';

const { Text, Title } = Typography;
const ALL_VALUE = '__ALL__';
const HEADER_STORAGE_KEY = 'koperasi-resort-development-report-header';

type HeaderDraft = {
  villageDistrictText: string;
  regencyText: string;
};

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}[char] ?? char));

const getInitialHeaderDraft = (): HeaderDraft => {
  try {
    const raw = window.localStorage.getItem(HEADER_STORAGE_KEY);
    if (!raw) return { villageDistrictText: '', regencyText: '' };
    const parsed = JSON.parse(raw) as Partial<HeaderDraft>;

    return {
      villageDistrictText: parsed.villageDistrictText ?? '',
      regencyText: parsed.regencyText ?? '',
    };
  } catch {
    return { villageDistrictText: '', regencyText: '' };
  }
};

const employeeLabel = (
  employee: Pick<CooperativeResortDevelopmentEmployeeOption, 'name' | 'position'>,
) => employee.position ? `${employee.name} - ${employee.position}` : employee.name;

const groupEmployeeLabel = (
  group: Pick<CooperativeResortDevelopmentReportGroup, 'employee_name' | 'employee_position'>,
  unassignedLabel: string,
) => {
  if (!group.employee_name) return unassignedLabel;
  return group.employee_position
    ? `${group.employee_name} - ${group.employee_position}`
    : group.employee_name;
};

const rowCells = (row: CooperativeResortDevelopmentReportRow) => [
  `${dayjs(row.date_key).tz().format('dddd').toUpperCase()} ${dayjs(row.date_key).tz().format('DD.MM.YYYY')}`,
  row.opening_balance_amount,
  row.drop_amount,
  row.service_amount,
  row.new_loan_amount,
  row.total_loan_amount,
  row.installment_amount,
  row.ending_balance_amount,
  '',
  '',
  '',
  '',
  '',
];

const summaryCells = (summary: CooperativeResortDevelopmentReportSummary) => [
  summary.opening_balance_amount,
  summary.drop_amount,
  summary.service_amount,
  summary.new_loan_amount,
  summary.total_loan_amount,
  summary.installment_amount,
  summary.ending_balance_amount,
  summary.active_member_count,
  summary.collection_ratio,
  summary.monthly_installment_target_amount,
  summary.target_difference_amount,
  summary.overdue_installment_count,
];

export default function CooperativeResortDevelopmentReportManagement() {
  const { message } = App.useApp();
  const { t, locale } = useI18n();
  const { profile } = useCompanyProfileSetting();
  const reportRef = useRef<HTMLDivElement | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<Dayjs>(() => dayjs().tz().startOf('month'));
  const [employeeId, setEmployeeId] = useState<string | undefined>();
  const [headerDraft, setHeaderDraft] = useState<HeaderDraft>(() => getInitialHeaderDraft());
  const filters = useMemo<CooperativeResortDevelopmentReportFilters>(() => ({
    monthDate: selectedMonth.startOf('month').toISOString(),
    employeeId,
  }), [employeeId, selectedMonth]);
  const reportQuery = useCooperativeResortDevelopmentReport(filters);
  const report = reportQuery.data;
  const isLoading = reportQuery.isLoading || reportQuery.isFetching;
  const hasRows = Boolean(report?.groups.length);
  const companyName = profile?.company_name || t('cooperative.ledger.companyFallback');
  const printDateText = dayjs().tz().format('YYYY-MM-DD HH:mm:ss');
  const monthText = selectedMonth.format('MMMM YYYY').toUpperCase();
  const selectedEmployee = report?.employeeOptions.find((employee) => employee.id === employeeId);
  const employeeText = (() => {
    if (!employeeId) return t('cooperative.resortDevelopment.allEmployees');
    if (employeeId === COOPERATIVE_RESORT_DEVELOPMENT_UNASSIGNED_EMPLOYEE) {
      return t('cooperative.memberRegister.unassignedEmployee');
    }
    return selectedEmployee ? employeeLabel(selectedEmployee) : employeeId;
  })();
  const employeeOptions = useMemo(() => [
    { value: ALL_VALUE, label: t('cooperative.resortDevelopment.allEmployees') },
    {
      value: COOPERATIVE_RESORT_DEVELOPMENT_UNASSIGNED_EMPLOYEE,
      label: t('cooperative.memberRegister.unassignedEmployee'),
    },
    ...(report?.employeeOptions ?? []).map((employee) => ({
      value: employee.id,
      label: employeeLabel(employee),
    })),
  ], [report?.employeeOptions, t]);
  const columnHeaders = [
    t('cooperative.resortDevelopment.day'),
    t('cooperative.resortDevelopment.openingBalance'),
    t('cooperative.resortDevelopment.drop'),
    t('cooperative.resortDevelopment.service'),
    t('cooperative.resortDevelopment.newLoan'),
    t('cooperative.resortDevelopment.totalLoan'),
    t('cooperative.resortDevelopment.installment'),
    t('cooperative.resortDevelopment.endingBalance'),
    t('cooperative.resortDevelopment.activeMembers'),
    t('cooperative.resortDevelopment.collectionRatio'),
    t('cooperative.resortDevelopment.monthlyTarget'),
    t('cooperative.resortDevelopment.targetDifference'),
    t('cooperative.resortDevelopment.overdue'),
  ];

  useEffect(() => {
    window.localStorage.setItem(HEADER_STORAGE_KEY, JSON.stringify(headerDraft));
  }, [headerDraft]);

  const buildCsvRows = (): ExportRows => {
    if (!report) return [];
    const rows: ExportRows = [
      [t('cooperative.resortDevelopment.title')],
      [t('cooperative.resortDevelopment.cooperativeName'), companyName],
      [t('cooperative.resortDevelopment.villageDistrict'), headerDraft.villageDistrictText],
      [t('cooperative.resortDevelopment.regency'), headerDraft.regencyText],
      [t('cooperative.resortDevelopment.month'), monthText],
      [t('cooperative.resortDevelopment.employee'), employeeText],
      [t('report.printDate'), printDateText],
    ];

    report.groups.forEach((group) => {
      rows.push([]);
      rows.push([
        t('cooperative.resortDevelopment.resortEmployee'),
        groupEmployeeLabel(group, t('cooperative.memberRegister.unassignedEmployee')),
      ]);
      rows.push([
        t('cooperative.resortDevelopment.workArea'),
        group.area_names.join(', ') || '-',
      ]);
      rows.push(columnHeaders);
      group.rows.forEach((row) => rows.push(rowCells(row)));
      rows.push([
        t('cooperative.resortDevelopment.subtotal'),
        ...summaryCells(group.summary),
      ]);
    });

    rows.push([]);
    rows.push([
      t('cooperative.resortDevelopment.grandTotal'),
      ...summaryCells(report.summary),
    ]);
    rows.push([]);
    rows.push([
      t('cooperative.resortDevelopment.totalServiceIncome'),
      report.summary.service_amount,
    ]);
    rows.push([
      t('cooperative.resortDevelopment.receivableChange'),
      report.summary.ending_balance_amount - report.summary.opening_balance_amount,
    ]);
    rows.push([]);
    rows.push([
      t('cooperative.resortDevelopment.previousMonthComparison'),
      t('cooperative.resortDevelopment.currentMonth'),
      `${t('cooperative.resortDevelopment.previousMonth')} ${report.previous_month_comparison.month_key}`,
      t('cooperative.resortDevelopment.difference'),
    ]);
    rows.push([
      t('cooperative.resortDevelopment.drop'),
      report.previous_month_comparison.drop_amount.current_amount,
      report.previous_month_comparison.drop_amount.previous_amount,
      report.previous_month_comparison.drop_amount.difference_amount,
    ]);
    rows.push([
      t('cooperative.resortDevelopment.installment'),
      report.previous_month_comparison.installment_amount.current_amount,
      report.previous_month_comparison.installment_amount.previous_amount,
      report.previous_month_comparison.installment_amount.difference_amount,
    ]);
    rows.push([
      t('cooperative.resortDevelopment.collectionRatio'),
      report.previous_month_comparison.collection_ratio.current_percentage,
      report.previous_month_comparison.collection_ratio.previous_percentage,
      report.previous_month_comparison.collection_ratio.difference_percentage,
    ]);

    return rows;
  };

  const buildHtmlDocument = () => `<!doctype html>
<html lang="${locale}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(t('cooperative.resortDevelopment.title'))}</title>
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

  const exportFilenameBase = `laporan-perkembangan-resort-${selectedMonth.format('YYYY-MM')}`;

  const handleExportCsv = async (target: ExportTarget = 'auto') => {
    if (!report) return;
    try {
      const exported = await exportCsv({
        filename: `${exportFilenameBase}.csv`,
        rows: buildCsvRows(),
        target,
      });
      if (exported) message.success(t('cooperative.resortDevelopment.exportCsvSuccess'));
    } catch (error) {
      console.error('Failed to export resort development CSV:', error);
      message.error(t('cooperative.resortDevelopment.exportCsvFailed'));
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
      if (exported) message.success(t('cooperative.resortDevelopment.exportHtmlSuccess'));
    } catch (error) {
      console.error('Failed to export resort development HTML:', error);
      message.error(t('cooperative.resortDevelopment.exportHtmlFailed'));
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
      if (exported) message.success(t('cooperative.resortDevelopment.exportPdfSuccess'));
    } catch (error) {
      console.error('Failed to export resort development PDF:', error);
      message.error(t('cooperative.resortDevelopment.exportPdfFailed'));
    }
  };

  return (
    <div className="space-y-4 p-3 sm:p-4 md:p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <Title level={2} className="!mb-1 flex items-center gap-2">
            <FileText size={24} />
            {t('cooperative.resortDevelopment.title')}
          </Title>
          <Text type="secondary">{t('cooperative.resortDevelopment.subtitle')}</Text>
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

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div>
          <Text strong>{t('cooperative.resortDevelopment.month')}</Text>
          <DatePicker
            className="mt-2 w-full"
            picker="month"
            value={selectedMonth}
            format="MMMM YYYY"
            onChange={(value) => setSelectedMonth(value?.startOf('month') ?? dayjs().tz().startOf('month'))}
          />
        </div>
        <div>
          <Text strong>{t('cooperative.resortDevelopment.employee')}</Text>
          <Select
            data-testid="koperasi-resort-development-employee-filter"
            className="mt-2 w-full"
            value={employeeId ?? ALL_VALUE}
            options={employeeOptions}
            onChange={(value) => setEmployeeId(value === ALL_VALUE ? undefined : value)}
            showSearch
            optionFilterProp="label"
          />
        </div>
        <div>
          <Text strong>{t('cooperative.resortDevelopment.villageDistrict')}</Text>
          <Input
            className="mt-2"
            value={headerDraft.villageDistrictText}
            maxLength={120}
            onChange={(event) => setHeaderDraft((current) => ({
              ...current,
              villageDistrictText: event.target.value,
            }))}
          />
        </div>
        <div>
          <Text strong>{t('cooperative.resortDevelopment.regency')}</Text>
          <Input
            className="mt-2"
            value={headerDraft.regencyText}
            maxLength={120}
            onChange={(event) => setHeaderDraft((current) => ({
              ...current,
              regencyText: event.target.value,
            }))}
          />
        </div>
      </div>

      {!isLoading && !hasRows ? (
        <Empty description={t('cooperative.resortDevelopment.empty')} />
      ) : null}

      <div style={{ overflowX: 'auto' }}>
        <CooperativeResortDevelopmentReport
          ref={reportRef}
          data={report}
          companyName={companyName}
          logoDataUrl={profile?.logo_data_url}
          villageDistrictText={headerDraft.villageDistrictText}
          regencyText={headerDraft.regencyText}
          monthText={monthText}
          employeeText={employeeText}
          printDateText={printDateText}
        />
      </div>
    </div>
  );
}
