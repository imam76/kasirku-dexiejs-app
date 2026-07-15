import { useRef } from 'react';
import { FilePdfOutlined, FileTextOutlined } from '@ant-design/icons';
import { App, Alert, Space, Typography } from 'antd';
import ExportActions from '@/components/ExportActions';
import { useI18n } from '@/hooks/useI18n';
import type { TranslationKey } from '@/i18n/messages';
import dayjs from '@/lib/dayjs';
import type {
  CooperativeCashFlowActivity,
  CooperativeCashFlowStatement,
  CooperativeFinancialReadiness,
} from '@/services/cooperativeReportService';
import { exportCsv, exportHtmlPdf, saveExportFile, type ExportRows, type ExportTarget } from '@/utils/export';
import CooperativeCashFlowStatementReport from './CooperativeCashFlowStatementReport';

const { Text, Title } = Typography;

const cashFlowActivityLabelKey: Record<CooperativeCashFlowActivity, TranslationKey> = {
  OPERATING: 'cooperative.reports.cashFlow.operating',
  INVESTING: 'cooperative.reports.cashFlow.investing',
  FINANCING: 'cooperative.reports.cashFlow.financing',
};

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

type CooperativeCashFlowTabProps = {
  statement?: CooperativeCashFlowStatement;
  financialReadiness?: CooperativeFinancialReadiness;
  companyName: string;
  logoDataUrl?: string;
  periodText: string;
};

export default function CooperativeCashFlowTab({
  statement,
  financialReadiness,
  companyName,
  logoDataUrl,
  periodText,
}: CooperativeCashFlowTabProps) {
  const { message } = App.useApp();
  const { t, locale } = useI18n();
  const reportRef = useRef<HTMLDivElement | null>(null);

  const printDateText = dayjs().tz().format('YYYY-MM-DD HH:mm:ss');
  const canShow = Boolean(financialReadiness?.can_show_financial_statements);
  const isFinal = Boolean(financialReadiness?.is_ready);

  // ─── CSV builder ────────────────────────────────────────────────────
  const buildCsvRows = (): ExportRows => {
    if (!statement) return [];

    const rows: ExportRows = [
      [t('cooperative.reports.cashFlow.reportTitle'), printDateText],
      [t('cooperative.ledger.period'), periodText],
      [],
      [t('cooperative.reports.cashFlow.beginningCash'), statement.beginning_cash_amount],
      [t('cooperative.reports.cashFlow.operatingNet'), statement.operating_net_amount],
      [t('cooperative.reports.cashFlow.investingNet'), statement.investing_net_amount],
      [t('cooperative.reports.cashFlow.financingNet'), statement.financing_net_amount],
      [t('cooperative.reports.cashFlow.netChange'), statement.net_cash_change_amount],
      [t('cooperative.reports.cashFlow.endingCash'), statement.ending_cash_amount],
    ];

    statement.sections.forEach((section) => {
      rows.push([]);
      rows.push([t(cashFlowActivityLabelKey[section.activity])]);
      rows.push([
        t('cooperative.reports.table.date'),
        t('generalLedger.journal.number'),
        t('generalLedger.journal.source'),
        t('cooperative.reports.table.description'),
        t('cooperative.reports.cashFlow.cashIn'),
        t('cooperative.reports.cashFlow.cashOut'),
        t('cooperative.reports.cashFlow.net'),
      ]);

      section.rows.forEach((row) => {
        rows.push([
          row.entry_date ? dayjs(row.entry_date).tz().format('YYYY-MM-DD HH:mm') : '',
          row.entry_number,
          row.source_number || row.source_type,
          row.description,
          row.amount > 0 ? row.amount : 0,
          row.amount < 0 ? Math.abs(row.amount) : 0,
          row.amount,
        ]);
      });

      rows.push([
        '',
        '',
        '',
        `${t('common.total')} ${t(cashFlowActivityLabelKey[section.activity])}`,
        section.cash_in_amount,
        section.cash_out_amount,
        section.net_amount,
      ]);
    });

    return rows;
  };

  // ─── HTML document builder ───────────────────────────────────────────
  const buildHtmlDocument = () => {
    const reportHtml = reportRef.current?.outerHTML;
    const title = t('cooperative.reports.cashFlow.reportTitle');

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

  // ─── Export handlers ─────────────────────────────────────────────────
  const handleExportCsv = async (target: ExportTarget = 'auto') => {
    if (!statement) return;
    try {
      const exported = await exportCsv({
        filename: `laporan-arus-kas-koperasi-${dayjs().tz().format('YYYY-MM-DD')}.csv`,
        rows: buildCsvRows(),
        target,
      });
      if (!exported) return;
      message.success(t('cooperative.reports.cashFlow.exportCsvSuccess'));
    } catch (error) {
      console.error('Failed to export cooperative cash flow CSV:', error);
      message.error(t('cooperative.reports.cashFlow.exportCsvFailed'));
    }
  };

  const handleExportHtml = async (target: ExportTarget = 'auto') => {
    if (!statement || !reportRef.current) return;
    try {
      const exported = await saveExportFile({
        filename: `laporan-arus-kas-koperasi-${dayjs().tz().format('YYYY-MM-DD')}.html`,
        mimeType: 'text/html',
        content: buildHtmlDocument(),
        target,
      });
      if (!exported) return;
      message.success(t('cooperative.reports.cashFlow.exportHtmlSuccess'));
    } catch (error) {
      console.error('Failed to export cooperative cash flow HTML:', error);
      message.error(t('cooperative.reports.cashFlow.exportHtmlFailed'));
    }
  };

  const handleExportPdf = async (target: ExportTarget = 'auto') => {
    if (!statement || !reportRef.current) return;
    try {
      const exported = await exportHtmlPdf({
        filename: `laporan-arus-kas-koperasi-${dayjs().tz().format('YYYY-MM-DD')}.pdf`,
        element: reportRef.current,
        orientation: 'landscape',
        target,
      });
      if (!exported) return;
      message.success(t('cooperative.reports.cashFlow.exportPdfSuccess'));
    } catch (error) {
      console.error('Failed to export cooperative cash flow PDF:', error);
      message.error(t('cooperative.reports.cashFlow.exportPdfFailed'));
    }
  };

  // ─── Financial readiness guard ───────────────────────────────────────
  const readinessAlert = canShow ? (
    <Alert
      type={isFinal ? 'info' : 'warning'}
      showIcon
      message={isFinal
        ? t('cooperative.reports.financial.readyMessage', {
          date: financialReadiness?.cutoff_date?.slice(0, 10) ?? '-',
        })
        : t('cooperative.reports.financial.partialTitle')}
      description={isFinal ? undefined : (
        <Space direction="vertical" size={4}>
          {(financialReadiness?.messages.length
            ? financialReadiness.messages
            : [t('cooperative.reports.financial.partialDescription')]
          ).map((msg) => (
            <Text key={msg}>{msg}</Text>
          ))}
        </Space>
      )}
    />
  ) : (
    <Alert
      data-testid="koperasi-financial-readiness-alert"
      type="warning"
      showIcon
      message={t('cooperative.reports.financial.notReadyTitle')}
      description={
        <Space direction="vertical" size={4}>
          {(financialReadiness?.messages.length
            ? financialReadiness.messages
            : [t('cooperative.reports.financial.loading')]
          ).map((msg) => (
            <Text key={msg}>{msg}</Text>
          ))}
        </Space>
      }
    />
  );

  return (
    <Space direction="vertical" className="w-full" size="middle">
      {readinessAlert}

      {canShow && (
        <>
          {/* ── Header bar ── */}
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <Title level={4} className="!mb-1">
                {t('cooperative.reports.cashFlow.reportTitle')}
              </Title>
              <Text type="secondary">
                {t('cooperative.ledger.period')}: {periodText}
              </Text>
            </div>

            <ExportActions
              buttonType="default"
              disabled={!statement}
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
          </div>

          {/* ── Report ── */}
          <div style={{ overflowX: 'auto' }}>
            <CooperativeCashFlowStatementReport
              ref={reportRef}
              statement={statement}
              companyName={companyName}
              logoDataUrl={logoDataUrl}
              periodText={periodText}
              printDateText={printDateText}
            />
          </div>
        </>
      )}
    </Space>
  );
}
