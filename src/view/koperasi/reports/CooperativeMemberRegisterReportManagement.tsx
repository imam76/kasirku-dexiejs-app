import { useMemo, useRef, useState } from 'react';
import { FilePdfOutlined, FileTextOutlined } from '@ant-design/icons';
import { App, Alert, Button, DatePicker, Empty, Select, Space, Typography } from 'antd';
import type { Dayjs } from 'dayjs';
import { FileText, RefreshCw } from 'lucide-react';
import ExportActions from '@/components/ExportActions';
import { useCompanyProfileSetting } from '@/hooks/useCompanyProfileSetting';
import {
  useCooperativeMemberRegisterReport,
  type CooperativeMemberRegisterReportFilters,
} from '@/hooks/useCooperativeMemberRegisterReport';
import { useI18n } from '@/hooks/useI18n';
import dayjs from '@/lib/dayjs';
import {
  COOPERATIVE_MEMBER_REGISTER_UNASSIGNED_OFFICER,
  type CooperativeMemberRegisterOfficerOption,
} from '@/services/cooperativeMemberRegisterReportService';
import { exportCsv, exportHtmlPdf, saveExportFile, type ExportRows, type ExportTarget } from '@/utils/export';
import CooperativeMemberRegisterReport from './CooperativeMemberRegisterReport';

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

const getOfficerLabel = (officer: CooperativeMemberRegisterOfficerOption) => (
  officer.position ? `${officer.name} - ${officer.position}` : officer.name
);

const getDefaultFilters = (): CooperativeMemberRegisterReportFilters => ({});

export default function CooperativeMemberRegisterReportManagement() {
  const { message } = App.useApp();
  const { t, locale } = useI18n();
  const { profile } = useCompanyProfileSetting();
  const reportRef = useRef<HTMLDivElement | null>(null);
  const [filters, setFilters] = useState<CooperativeMemberRegisterReportFilters>(() => getDefaultFilters());
  const reportQuery = useCooperativeMemberRegisterReport(filters);
  const data = reportQuery.data;
  const isLoading = reportQuery.isLoading || reportQuery.isFetching;
  const companyName = profile?.company_name || t('cooperative.ledger.companyFallback');
  const printDateText = dayjs().tz().format('YYYY-MM-DD HH:mm:ss');
  const periodText = `${filters.startDate ? dayjs(filters.startDate).tz().format('YYYY-MM-DD') : t('common.all')} - ${filters.endDate ? dayjs(filters.endDate).tz().format('YYYY-MM-DD') : t('common.all')}`;
  const selectedOfficerLabel = (() => {
    if (!filters.officerId) return t('cooperative.memberRegister.allEmployees');
    if (filters.officerId === COOPERATIVE_MEMBER_REGISTER_UNASSIGNED_OFFICER) {
      return t('cooperative.memberRegister.unassignedEmployee');
    }

    const selectedOfficer = data?.officerOptions.find((officer) => officer.id === filters.officerId);
    return selectedOfficer ? getOfficerLabel(selectedOfficer) : filters.officerId;
  })();
  const dateRange = useMemo<[Dayjs, Dayjs] | null>(() => {
    if (!filters.startDate || !filters.endDate) return null;
    return [dayjs(filters.startDate).tz(), dayjs(filters.endDate).tz()];
  }, [filters.endDate, filters.startDate]);
  const officerOptions = useMemo(() => [
    { value: ALL_VALUE, label: t('cooperative.memberRegister.allEmployees') },
    {
      value: COOPERATIVE_MEMBER_REGISTER_UNASSIGNED_OFFICER,
      label: t('cooperative.memberRegister.unassignedEmployee'),
    },
    ...(data?.officerOptions ?? []).map((officer) => ({
      value: officer.id,
      label: getOfficerLabel(officer),
    })),
  ], [data?.officerOptions, t]);
  const hasRows = Boolean(data?.groups.length);

  const buildCsvRows = (): ExportRows => {
    if (!data) return [];

    const rows: ExportRows = [
      [t('cooperative.memberRegister.title'), printDateText],
      [t('cooperative.ledger.period'), periodText],
      [t('cooperative.memberRegister.employeeName'), selectedOfficerLabel],
      [t('cooperative.memberRegister.totalMembers'), data.total_member_count],
    ];

    data.groups.forEach((group) => {
      const officerLabel = group.officer_name
        ? `${group.officer_name}${group.officer_position ? ` - ${group.officer_position}` : ''}`
        : t('cooperative.memberRegister.unassignedEmployee');

      rows.push([]);
      rows.push([t('cooperative.memberRegister.employeeName'), officerLabel]);
      rows.push([
        t('cooperative.memberRegister.table.joinDate'),
        t('cooperative.memberRegister.table.code'),
        t('cooperative.memberRegister.table.name'),
        t('cooperative.memberRegister.table.address'),
      ]);
      group.rows.forEach((row) => {
        rows.push([
          dayjs(row.join_date).tz().format('YYYY-MM-DD'),
          row.code,
          row.name,
          row.address ?? '',
        ]);
      });
      rows.push(['', '', t('common.total'), group.member_count]);
    });

    return rows;
  };

  const buildHtmlDocument = () => {
    const reportHtml = reportRef.current?.outerHTML;
    const title = t('cooperative.memberRegister.title');

    return `<!doctype html>
<html lang="${locale}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    @page { size: A4 landscape; margin: 12mm; }
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
    if (!data) return;
    try {
      const exported = await exportCsv({
        filename: `laporan-induk-anggota-${dayjs().tz().format('YYYY-MM-DD')}.csv`,
        rows: buildCsvRows(),
        target,
      });
      if (!exported) return;
      message.success(t('cooperative.memberRegister.exportCsvSuccess'));
    } catch (error) {
      console.error('Failed to export member register CSV:', error);
      message.error(t('cooperative.memberRegister.exportCsvFailed'));
    }
  };

  const handleExportHtml = async (target: ExportTarget = 'auto') => {
    if (!data || !reportRef.current) return;
    try {
      const exported = await saveExportFile({
        filename: `laporan-induk-anggota-${dayjs().tz().format('YYYY-MM-DD')}.html`,
        mimeType: 'text/html',
        content: buildHtmlDocument(),
        target,
      });
      if (!exported) return;
      message.success(t('cooperative.memberRegister.exportHtmlSuccess'));
    } catch (error) {
      console.error('Failed to export member register HTML:', error);
      message.error(t('cooperative.memberRegister.exportHtmlFailed'));
    }
  };

  const handleExportPdf = async (target: ExportTarget = 'auto') => {
    if (!data || !reportRef.current) return;
    try {
      const exported = await exportHtmlPdf({
        filename: `laporan-induk-anggota-${dayjs().tz().format('YYYY-MM-DD')}.pdf`,
        element: reportRef.current,
        orientation: 'landscape',
        target,
      });
      if (!exported) return;
      message.success(t('cooperative.memberRegister.exportPdfSuccess'));
    } catch (error) {
      console.error('Failed to export member register PDF:', error);
      message.error(t('cooperative.memberRegister.exportPdfFailed'));
    }
  };

  return (
    <div className="space-y-4 p-3 sm:p-4 md:p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <Title level={2} className="!mb-1 flex items-center gap-2">
            <FileText size={24} />
            {t('cooperative.memberRegister.title')}
          </Title>
          <Text type="secondary">{t('cooperative.memberRegister.subtitle')}</Text>
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

      <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(260px,360px)_minmax(220px,320px)]">
        <div>
          <Text strong>{t('cooperative.memberRegister.dateRange')}</Text>
          <DatePicker.RangePicker
            className="mt-2 w-full"
            value={dateRange}
            format="YYYY-MM-DD"
            onChange={(value) => {
              const fromDate = value?.[0];
              const toDate = value?.[1];

              if (!fromDate || !toDate) {
                setFilters((current) => ({ ...current, startDate: undefined, endDate: undefined }));
                return;
              }

              setFilters((current) => ({
                ...current,
                startDate: fromDate.startOf('day').toISOString(),
                endDate: toDate.endOf('day').toISOString(),
              }));
            }}
          />
        </div>
        <div>
          <Text strong>{t('cooperative.memberRegister.employeeName')}</Text>
          <Select
            showSearch
            optionFilterProp="label"
            className="mt-2 w-full"
            value={filters.officerId ?? ALL_VALUE}
            options={officerOptions}
            onChange={(value: string) => setFilters((current) => ({
              ...current,
              officerId: value === ALL_VALUE ? undefined : value,
            }))}
          />
        </div>
      </div>

      {!isLoading && !hasRows ? (
        <Empty description={t('cooperative.memberRegister.empty')} />
      ) : null}

      <div style={{ overflowX: 'auto' }}>
        <CooperativeMemberRegisterReport
          ref={reportRef}
          data={data}
          companyName={companyName}
          logoDataUrl={profile?.logo_data_url}
          periodText={periodText}
          printDateText={printDateText}
        />
      </div>
    </div>
  );
}
