import { useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { App, Modal } from 'antd';
import { FileExcelOutlined, FilePdfOutlined, FileTextOutlined } from '@ant-design/icons';
import ExportActions from '@/components/ExportActions';
import { useCompanyProfileSetting } from '@/hooks/useCompanyProfileSetting';
import { useI18n } from '@/hooks/useI18n';
import { db } from '@/lib/db';
import dayjs from '@/lib/dayjs';
import { buildBudgetReport } from '@/services/budgetReportService';
import type { Budget, BudgetCommitment } from '@/types';
import { exportHtmlPdf, exportXlsx, saveExportFile, type ExportTarget } from '@/utils/export';
import { formatBudgetPeriodLabel } from './budgetFormatters';
import BudgetReportDocument from './BudgetReportDocument';

interface BudgetReportModalProps {
  open: boolean;
  budget: Budget | null;
  commitments: BudgetCommitment[];
  onClose: () => void;
}

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

const slugify = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

export default function BudgetReportModal({ open, budget, commitments, onClose }: BudgetReportModalProps) {
  const { message } = App.useApp();
  const { t, locale } = useI18n();
  const { profile } = useCompanyProfileSetting();
  const reportRef = useRef<HTMLDivElement | null>(null);

  const { data: transactions = [] } = useQuery({
    queryKey: ['financeTransactions'],
    queryFn: async () => db.financeTransactions.orderBy('created_at').reverse().toArray(),
    enabled: open,
  });

  const report = useMemo(() => (
    budget ? buildBudgetReport(budget, transactions, commitments) : null
  ), [budget, transactions, commitments]);

  const companyName = profile?.company_name || 'Frayukti';
  const printDateText = dayjs().tz().format('YYYY-MM-DD HH:mm:ss');
  const exportFilenameBase = budget
    ? `laporan-anggaran-${slugify(budget.name)}-${dayjs().tz().format('YYYY-MM-DD')}`
    : 'laporan-anggaran';

  const buildHtmlDocument = () => `<!doctype html>
<html lang="${locale}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(t('budget.report.title'))}</title>
  <style>
    @page { size: A4 portrait; margin: 12mm; }
    * { box-sizing: border-box; }
    body { margin: 0; background: #f3f4f6; color: #111827; font-family: Arial, sans-serif; padding: 24px; }
    .report-shell { margin: 0 auto; max-width: 960px; }
    @media print {
      body { background: #fff; padding: 0; }
    }
  </style>
</head>
<body>
  <main class="report-shell">${reportRef.current?.outerHTML ?? ''}</main>
</body>
</html>`;

  const handleExportPDF = async (target: ExportTarget = 'auto') => {
    if (!report || !reportRef.current) return;
    try {
      const exported = await exportHtmlPdf({
        filename: `${exportFilenameBase}.pdf`,
        element: reportRef.current,
        orientation: 'portrait',
        target,
      });
      if (exported) message.success(t('budget.report.exportPdfSuccess'));
    } catch (error) {
      console.error('Failed to export budget report PDF:', error);
      message.error(t('budget.report.exportPdfFailed'));
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
      if (exported) message.success(t('budget.report.exportHtmlSuccess'));
    } catch (error) {
      console.error('Failed to export budget report HTML:', error);
      message.error(t('budget.report.exportHtmlFailed'));
    }
  };

  const handleExportExcel = async (target: ExportTarget = 'auto') => {
    if (!report) return;
    try {
      const paymentMethodLabel = (method?: string) => (method === 'NON_TUNAI' ? t('payment.nonCash') : t('payment.cash'));

      const header = [
        [companyName],
        [t('budget.report.title')],
        [`${t('budget.title')}: ${report.budget.name}`],
        [`${t('report.periodWithColon')} ${formatBudgetPeriodLabel(report.budget)}`],
        [`${t('report.printDate')} ${printDateText}`],
        [],
        [t('budget.commitment.plannedAmount'), report.budget.planned_amount],
        [t('budget.commitment.actualAmount'), report.realization.actual_amount],
        [t('budget.commitment.committedAmount'), report.realization.committed_amount],
        [t('budget.commitment.availableAmount'), report.realization.available_amount],
        [],
        [t('budget.report.realizedTransactionsTitle')],
        [t('report.dateTime'), t('report.descriptionLong'), t('checkout.method'), t('report.amount')],
      ];

      const transactionRows = report.realizedTransactions.map((transaction) => [
        dayjs(transaction.created_at).tz().format('YYYY-MM-DD HH:mm'),
        transaction.description || '-',
        paymentMethodLabel(transaction.payment_method),
        transaction.amount,
      ]);

      const transactionFooter = [
        ['', '', t('report.totalOverall'), report.realization.actual_amount],
      ];

      const plannedHeader = [
        [],
        [t('budget.report.plannedCommitmentsTitle')],
        [t('budget.commitment.description'), t('budget.commitment.notes'), t('budget.commitment.amount')],
      ];

      const plannedRows = report.plannedCommitments.map((commitment) => [
        commitment.description,
        commitment.notes || '-',
        commitment.amount,
      ]);

      const plannedFooter = [
        ['', t('report.totalOverall'), report.realization.committed_amount],
      ];

      await exportXlsx({
        filename: `${exportFilenameBase}.xlsx`,
        target,
        sheets: [
          {
            name: t('budget.report.title'),
            rows: [
              ...header,
              ...transactionRows,
              ...transactionFooter,
              ...plannedHeader,
              ...plannedRows,
              ...plannedFooter,
            ],
          },
        ],
      });
      message.success(t('budget.report.exportExcelSuccess'));
    } catch (error) {
      console.error('Failed to export budget report Excel:', error);
      message.error(t('budget.report.exportExcelFailed'));
    }
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width={920}
      destroyOnClose
      title={
        <div className="flex items-center justify-between gap-2 pr-8">
          <span>{t('budget.report.title')}</span>
          <ExportActions
            formats={[
              { key: 'pdf', label: 'PDF', icon: <FilePdfOutlined className="text-[12px]" />, onExport: handleExportPDF },
              { key: 'html', label: 'HTML', icon: <FileTextOutlined className="text-[12px]" />, onExport: handleExportHtml },
              { key: 'excel', label: 'Excel', icon: <FileExcelOutlined className="text-[12px]" />, onExport: handleExportExcel },
            ]}
            disabled={!report}
          />
        </div>
      }
    >
      <div className="overflow-x-auto pt-2">
        {report ? (
          <BudgetReportDocument
            ref={reportRef}
            report={report}
            companyName={companyName}
            logoDataUrl={profile?.logo_data_url}
            printDateText={printDateText}
          />
        ) : null}
      </div>
    </Modal>
  );
}
