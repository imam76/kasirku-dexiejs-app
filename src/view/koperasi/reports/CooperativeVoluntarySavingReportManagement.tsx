import { useMemo, useRef, useState } from 'react';
import { FilePdfOutlined, FileTextOutlined } from '@ant-design/icons';
import { App, Alert, Button, DatePicker, Empty, Input, Space, Typography } from 'antd';
import type { Dayjs } from 'dayjs';
import { FileText, RefreshCw } from 'lucide-react';
import ExportActions from '@/components/ExportActions';
import { useCompanyProfileSetting } from '@/hooks/useCompanyProfileSetting';
import { useCooperativeVoluntarySavingReport } from '@/hooks/useCooperativeVoluntarySavingReport';
import { useI18n } from '@/hooks/useI18n';
import dayjs from '@/lib/dayjs';
import { exportCsv, exportHtmlPdf, saveExportFile, type ExportRows, type ExportTarget } from '@/utils/export';
import { formatCurrency } from '@/utils/formatters';
import CooperativeVoluntarySavingReport from './CooperativeVoluntarySavingReport';

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

export default function CooperativeVoluntarySavingReportManagement() {
  const { message } = App.useApp();
  const { t, locale } = useI18n();
  const { profile } = useCompanyProfileSetting();
  const reportRef = useRef<HTMLDivElement | null>(null);
  const [asOfDate, setAsOfDate] = useState<Dayjs>(() => dayjs().tz().startOf('day'));
  const [searchText, setSearchText] = useState('');
  const filters = useMemo(() => ({
    asOfDate: asOfDate.format('YYYY-MM-DD'),
    searchText,
  }), [asOfDate, searchText]);
  const reportQuery = useCooperativeVoluntarySavingReport(filters);
  const data = reportQuery.data;
  const isLoading = reportQuery.isLoading || reportQuery.isFetching;
  const hasRows = Boolean(data?.rows.length);
  const companyName = profile?.company_name || t('cooperative.ledger.companyFallback');
  const asOfDateText = asOfDate.locale(locale).format('DD MMMM YYYY');
  const printDateText = dayjs().tz().locale(locale).format('DD MMMM YYYY HH:mm:ss');
  const exportFilenameBase = `laporan-simpanan-sukarela-${asOfDate.format('YYYY-MM-DD')}`;

  const buildCsvRows = (): ExportRows => {
    if (!data) return [];

    const rows: ExportRows = [
      [t('cooperative.voluntarySavingReport.title')],
      [t('cooperative.voluntarySavingReport.asOfDate'), asOfDateText],
      [t('report.printDate'), printDateText],
      [],
      [
        t('cooperative.voluntarySavingReport.memberName'),
        t('cooperative.voluntarySavingReport.balance'),
        t('cooperative.voluntarySavingReport.availableInterest'),
        t('cooperative.voluntarySavingReport.subTotal'),
      ],
    ];

    data.rows.forEach((row) => {
      rows.push([
        `${row.member_name} (${row.member_number})`,
        row.balance,
        row.available_interest,
        row.sub_total,
      ]);
    });

    rows.push([
      t('common.total'),
      data.summary.total_balance,
      data.summary.total_available_interest,
      data.summary.total_sub_total,
    ]);

    return rows;
  };

  const buildHtmlDocument = () => `<!doctype html>
<html lang="${locale}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(t('cooperative.voluntarySavingReport.title'))}</title>
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

  const handleExportCsv = async (target: ExportTarget = 'auto') => {
    if (!data) return;
    try {
      const exported = await exportCsv({
        filename: `${exportFilenameBase}.csv`,
        rows: buildCsvRows(),
        target,
      });
      if (exported) message.success(t('cooperative.voluntarySavingReport.exportCsvSuccess'));
    } catch (error) {
      console.error('Failed to export cooperative voluntary saving report CSV:', error);
      message.error(t('cooperative.voluntarySavingReport.exportCsvFailed'));
    }
  };

  const handleExportHtml = async (target: ExportTarget = 'auto') => {
    if (!data || !reportRef.current) return;
    try {
      const exported = await saveExportFile({
        filename: `${exportFilenameBase}.html`,
        mimeType: 'text/html',
        content: buildHtmlDocument(),
        target,
      });
      if (exported) message.success(t('cooperative.voluntarySavingReport.exportHtmlSuccess'));
    } catch (error) {
      console.error('Failed to export cooperative voluntary saving report HTML:', error);
      message.error(t('cooperative.voluntarySavingReport.exportHtmlFailed'));
    }
  };

  const handleExportPdf = async (target: ExportTarget = 'auto') => {
    if (!data || !reportRef.current) return;
    try {
      const exported = await exportHtmlPdf({
        filename: `${exportFilenameBase}.pdf`,
        element: reportRef.current,
        orientation: 'portrait',
        target,
      });
      if (exported) message.success(t('cooperative.voluntarySavingReport.exportPdfSuccess'));
    } catch (error) {
      console.error('Failed to export cooperative voluntary saving report PDF:', error);
      message.error(t('cooperative.voluntarySavingReport.exportPdfFailed'));
    }
  };

  return (
    <div className="space-y-4 p-3 sm:p-4 md:p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <Title level={2} className="!mb-1 flex items-center gap-2">
            <FileText size={24} />
            {t('cooperative.voluntarySavingReport.title')}
          </Title>
          <Text type="secondary">{t('cooperative.voluntarySavingReport.subtitle')}</Text>
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

      <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(180px,260px)_minmax(260px,420px)]">
        <div>
          <Text strong>{t('cooperative.voluntarySavingReport.asOfDate')}</Text>
          <DatePicker
            className="mt-2 w-full"
            value={asOfDate}
            format="DD MMMM YYYY"
            onChange={(value) => setAsOfDate(value?.startOf('day') ?? dayjs().tz().startOf('day'))}
            data-testid="koperasi-voluntary-saving-as-of-filter"
          />
        </div>
        <div>
          <Text strong>{t('cooperative.voluntarySavingReport.search')}</Text>
          <Input.Search
            allowClear
            className="mt-2 w-full"
            value={searchText}
            placeholder={t('cooperative.voluntarySavingReport.searchPlaceholder')}
            onChange={(event) => setSearchText(event.target.value)}
            data-testid="koperasi-voluntary-saving-search-filter"
          />
        </div>
      </div>

      {data ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <div className="rounded-lg border border-gray-100 bg-white p-4">
            <Text type="secondary">{t('cooperative.voluntarySavingReport.memberCount')}</Text>
            <div className="mt-1 text-xl font-semibold text-gray-900">{data.summary.row_count}</div>
          </div>
          <div className="rounded-lg border border-gray-100 bg-white p-4">
            <Text type="secondary">{t('cooperative.voluntarySavingReport.balance')}</Text>
            <div className="mt-1 text-xl font-semibold text-gray-900">
              Rp {formatCurrency(data.summary.total_balance)}
            </div>
          </div>
          <div className="rounded-lg border border-gray-100 bg-white p-4">
            <Text type="secondary">{t('cooperative.voluntarySavingReport.availableInterest')}</Text>
            <div className="mt-1 text-xl font-semibold text-gray-900">
              Rp {formatCurrency(data.summary.total_available_interest)}
            </div>
          </div>
          <div className="rounded-lg border border-gray-100 bg-white p-4">
            <Text type="secondary">{t('cooperative.voluntarySavingReport.subTotal')}</Text>
            <div className="mt-1 text-xl font-semibold text-gray-900">
              Rp {formatCurrency(data.summary.total_sub_total)}
            </div>
          </div>
        </div>
      ) : null}

      {!isLoading && !hasRows ? (
        <Empty description={t('cooperative.voluntarySavingReport.empty')} />
      ) : null}

      <div style={{ overflowX: 'auto' }}>
        <CooperativeVoluntarySavingReport
          ref={reportRef}
          data={data}
          companyName={companyName}
          logoDataUrl={profile?.logo_data_url}
          asOfDateText={asOfDateText}
          printDateText={printDateText}
        />
      </div>
    </div>
  );
}
