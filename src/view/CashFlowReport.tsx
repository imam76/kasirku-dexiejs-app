import { FilePdfOutlined, FileTextOutlined, ReloadOutlined } from '@ant-design/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import { App, Button, Card, Checkbox, DatePicker, Select, Typography } from 'antd';
import type { Dayjs } from 'dayjs';
import autoTable from 'jspdf-autotable';
import { useEffect, useMemo, useRef, useState } from 'react';
import ExportActions from '@/components/ExportActions';
import { Loading } from '@/components/Loading';
import { useCashFlowReport } from '@/hooks/useCashFlowReport';
import { useCompanyProfileSetting } from '@/hooks/useCompanyProfileSetting';
import { useBaseCurrency } from '@/hooks/useBaseCurrency';
import { useI18n } from '@/hooks/useI18n';
import { useIsMobile } from '@/hooks/useIsMobile';
import { getFinanceCategoryLabel } from '@/i18n/finance';
import dayjs from '@/lib/dayjs';
import { recalculateFinance } from '@/services/financeService';
import {
  CASH_FLOW_ALL_CLASSIFICATION,
  getCashFlowSignedAmount,
  type CashFlowReportClassification,
  type CashFlowReportData,
  type CashFlowReportFilters,
  type CashFlowReportGroup,
} from '@/services/cashFlowReportService';
import type { FinanceTransaction } from '@/types';
import { exportCsv, exportPdf, saveExportFile, type ExportRows, type ExportTarget } from '@/utils/export';
import { formatCurrency, formatDate } from '@/utils/formatters';

const { Text, Title } = Typography;

type CashFlowDateShortcut = 'THIS_MONTH' | 'LAST_MONTH' | 'THIS_YEAR' | 'CUSTOM';

type JsPdfWithAutoTable = {
  lastAutoTable?: {
    finalY: number;
  };
};

const emptyReport: CashFlowReportData = {
  groups: [],
  totals: { cashIn: 0, cashOut: 0, net: 0 },
  categoryOptions: [],
  transactionCount: 0,
};

const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (char) => {
  const entities: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return entities[char] ?? char;
});

const getDateRange = (shortcut: Exclude<CashFlowDateShortcut, 'CUSTOM'>): [Dayjs, Dayjs] => {
  const now = dayjs().tz();
  if (shortcut === 'LAST_MONTH') return [now.subtract(1, 'month').startOf('month'), now.subtract(1, 'month').endOf('month')];
  if (shortcut === 'THIS_YEAR') return [now.startOf('year'), now.endOf('year')];
  return [now.startOf('month'), now.endOf('month')];
};

const getAccountLabel = (group: Pick<CashFlowReportGroup, 'accountCode' | 'accountName'>) => (
  group.accountCode ? `${group.accountCode} - ${group.accountName}` : group.accountName
);

const getCashInAmount = (transaction: FinanceTransaction) => {
  const signedAmount = getCashFlowSignedAmount(transaction);
  return signedAmount >= 0 ? signedAmount : 0;
};

const getCashOutAmount = (transaction: FinanceTransaction) => {
  const signedAmount = getCashFlowSignedAmount(transaction);
  return signedAmount < 0 ? Math.abs(signedAmount) : 0;
};

interface CashFlowGroupSectionProps {
  group: CashFlowReportGroup;
  formatCategory: (category: string) => string;
  money: (value: number) => string;
}

const CashFlowGroupSection = ({ group, formatCategory, money }: CashFlowGroupSectionProps) => {
  const parentRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: group.transactions.length,
    getScrollElement: () => parentRef.current,
    getItemKey: (index) => group.transactions[index]?.id ?? index,
    estimateSize: () => 44,
    overscan: 8,
  });
  const viewportHeight = group.transactions.length === 0
    ? 44
    : Math.min(420, Math.max(88, group.transactions.length * 44));
  const gridTemplateColumns = '145px 180px minmax(260px,1fr) 140px 140px 140px';

  return (
    <section style={{ border: '1px solid #d1d5db', breakInside: 'avoid', marginBottom: 16 }}>
      <div style={{ background: '#f3f4f6', borderBottom: '1px solid #d1d5db', display: 'grid', gap: 12, gridTemplateColumns: '1fr 150px 150px 150px', padding: '10px 12px' }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{getAccountLabel(group)}</div>
          <div style={{ color: '#6b7280', fontSize: 12 }}>{group.transactions.length} transaksi</div>
        </div>
        <div style={{ textAlign: 'right' }}><div style={{ color: '#4b5563', fontSize: 12 }}>Kas Masuk</div><strong>{money(group.cashIn)}</strong></div>
        <div style={{ textAlign: 'right' }}><div style={{ color: '#4b5563', fontSize: 12 }}>Kas Keluar</div><strong>{money(group.cashOut)}</strong></div>
        <div style={{ textAlign: 'right' }}><div style={{ color: '#4b5563', fontSize: 12 }}>Net</div><strong style={{ color: group.net < 0 ? '#dc2626' : '#111827' }}>{money(group.net)}</strong></div>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <div style={{ minWidth: 980 }}>
          <div style={{ display: 'grid', gridTemplateColumns }}>
            {['Tanggal', 'Klasifikasi', 'Deskripsi', 'Kas Masuk', 'Kas Keluar', 'Net'].map((label) => (
              <div key={label} style={{ background: '#f9fafb', border: '1px solid #d1d5db', fontSize: 13, fontWeight: 700, padding: '8px 10px', textAlign: label.startsWith('Kas') || label === 'Net' ? 'right' : 'left' }}>
                {label}
              </div>
            ))}
          </div>
          {group.transactions.length === 0 ? (
            <div style={{ border: '1px solid #d1d5db', fontSize: 13, padding: '8px 10px', textAlign: 'center' }}>Zero balance</div>
          ) : (
            <div ref={parentRef} style={{ height: viewportHeight, overflow: 'auto' }}>
              <div style={{ height: rowVirtualizer.getTotalSize(), position: 'relative', width: '100%' }}>
                {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                  const transaction = group.transactions[virtualRow.index];
                  if (!transaction) return null;
                  const signedAmount = getCashFlowSignedAmount(transaction);

                  return (
                    <div
                      key={virtualRow.key}
                      style={{
                        display: 'grid',
                        gridTemplateColumns,
                        height: 44,
                        left: 0,
                        position: 'absolute',
                        top: 0,
                        transform: `translateY(${virtualRow.start}px)`,
                        width: '100%',
                      }}
                    >
                      <div style={{ border: '1px solid #d1d5db', fontSize: 13, overflow: 'hidden', padding: '8px 10px', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{formatDate(transaction.created_at)}</div>
                      <div style={{ border: '1px solid #d1d5db', fontSize: 13, overflow: 'hidden', padding: '8px 10px', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{formatCategory(transaction.category)}</div>
                      <div style={{ border: '1px solid #d1d5db', fontSize: 13, overflow: 'hidden', padding: '8px 10px', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={transaction.description}>{transaction.description}</div>
                      <div style={{ border: '1px solid #d1d5db', fontSize: 13, padding: '8px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>{signedAmount >= 0 ? money(signedAmount) : '-'}</div>
                      <div style={{ border: '1px solid #d1d5db', fontSize: 13, padding: '8px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>{signedAmount < 0 ? money(Math.abs(signedAmount)) : '-'}</div>
                      <div style={{ border: '1px solid #d1d5db', color: signedAmount < 0 ? '#dc2626' : '#111827', fontSize: 13, padding: '8px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>{money(signedAmount)}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

export default function CashFlowReport() {
  const { message, modal } = App.useApp();
  const queryClient = useQueryClient();
  const { t, locale } = useI18n();
  const { baseCurrency, baseCurrencyCode, baseCurrencySymbol } = useBaseCurrency();
  const isMobile = useIsMobile();
  const { profile } = useCompanyProfileSetting();
  const [dateShortcut, setDateShortcut] = useState<CashFlowDateShortcut>('THIS_MONTH');
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs]>(() => getDateRange('THIS_MONTH'));
  const [currencyCode, setCurrencyCode] = useState(baseCurrencyCode);
  const [classification, setClassification] = useState<CashFlowReportClassification>(CASH_FLOW_ALL_CLASSIFICATION);
  const [showZeroBalance, setShowZeroBalance] = useState(false);
  const money = (value: number) => `${baseCurrencySymbol} ${formatCurrency(value || 0)}`;
  const filters = useMemo<CashFlowReportFilters>(() => ({
    startDate: dateRange[0].startOf('day').toISOString(),
    endDate: dateRange[1].endOf('day').toISOString(),
    classification,
    currencyCode,
    includeZeroBalance: showZeroBalance,
  }), [classification, currencyCode, dateRange, showZeroBalance]);
  const reportQuery = useCashFlowReport(filters);
  const report = reportQuery.data ?? emptyReport;
  const groups = report.groups;
  const totals = report.totals;

  useEffect(() => {
    setCurrencyCode(baseCurrencyCode);
  }, [baseCurrencyCode]);

  const recalculateMutation = useMutation({
    mutationFn: recalculateFinance,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cashFlowReport'] });
      message.success(t('finance.recalculateSuccess'));
    },
    onError: (error: Error) => {
      modal.error({
        title: t('finance.recalculateFailedTitle'),
        content: error.message || t('finance.recalculateFailedContent'),
      });
    },
  });
  const classificationOptions = useMemo(() => [
    { value: CASH_FLOW_ALL_CLASSIFICATION, label: 'Semua Klasifikasi' },
    { value: 'TYPE:INCOME', label: t('finance.income') },
    { value: 'TYPE:EXPENSE', label: t('finance.expense') },
    { value: 'TYPE:OPENING_BALANCE', label: t('finance.openingBalance') },
    ...report.categoryOptions.map((category) => ({
      value: `CATEGORY:${category}`,
      label: getFinanceCategoryLabel(category, t),
    })),
  ], [report.categoryOptions, t]);
  const formatCategory = (category: string) => getFinanceCategoryLabel(category, t);
  const periodText = `${dateRange[0].format('YYYY-MM-DD')} - ${dateRange[1].format('YYYY-MM-DD')}`;
  const classificationText = classificationOptions.find((option) => option.value === classification)?.label ??
    (classification.startsWith('CATEGORY:') ? formatCategory(classification.replace('CATEGORY:', '')) : 'Semua Klasifikasi');
  const companyName = profile?.company_name || 'Frayukti';
  const printDateText = dayjs().tz().locale(locale).format('YYYY-MM-DD HH:mm:ss');
  const filenameBase = `laporan-arus-kas-${dateRange[0].format('YYYY-MM-DD')}-${dateRange[1].format('YYYY-MM-DD')}`;

  const buildCsvRows = (): ExportRows => {
    const rows: ExportRows = [
      ['Laporan Arus Kas'],
      ['Perusahaan', companyName],
      ['Periode', periodText],
      ['Mata Uang', currencyCode],
      ['Klasifikasi', classificationText],
      [],
      ['Akun', 'Tanggal', 'Klasifikasi', 'Deskripsi', 'Kas Masuk', 'Kas Keluar', 'Net'],
    ];

    groups.forEach((group) => {
      rows.push([
        getAccountLabel(group),
        '',
        'Subtotal Akun',
        '',
        group.cashIn,
        group.cashOut,
        group.net,
      ]);
      group.transactions.forEach((transaction) => {
        rows.push([
          '',
          dayjs(transaction.created_at).tz().format('YYYY-MM-DD HH:mm'),
          formatCategory(transaction.category),
          transaction.description,
          getCashInAmount(transaction),
          getCashOutAmount(transaction),
          getCashFlowSignedAmount(transaction),
        ]);
      });
    });

    rows.push([]);
    rows.push(['Total', '', '', '', totals.cashIn, totals.cashOut, totals.net]);
    return rows;
  };

  const buildFullReportMarkup = () => `
    <div class="report">
      <header class="report-header">
        <div>
          <div class="company">${escapeHtml(companyName)}</div>
          <div class="muted">Laporan Keuangan</div>
        </div>
        <div class="meta">
          <div>Periode: ${escapeHtml(periodText)}</div>
          <div>Mata Uang: ${escapeHtml(currencyCode)}</div>
          <div>Tanggal Cetak: ${escapeHtml(printDateText)}</div>
        </div>
      </header>
      <section class="title">
        <h1>Laporan Arus Kas</h1>
        <p>${escapeHtml(classificationText)}</p>
      </section>
      <section class="total-grid">
        <div>Total</div>
        <div>${escapeHtml(money(totals.cashIn))}</div>
        <div>${escapeHtml(money(totals.cashOut))}</div>
        <div>${escapeHtml(money(totals.net))}</div>
      </section>
      ${groups.length === 0
        ? '<div class="empty">Belum ada transaksi arus kas untuk filter ini.</div>'
        : groups.map((group) => `
          <section class="group">
            <div class="group-header">
              <div>
                <strong>${escapeHtml(getAccountLabel(group))}</strong>
                <span>${group.transactions.length} transaksi</span>
              </div>
              <div><span>Kas Masuk</span><strong>${escapeHtml(money(group.cashIn))}</strong></div>
              <div><span>Kas Keluar</span><strong>${escapeHtml(money(group.cashOut))}</strong></div>
              <div><span>Net</span><strong>${escapeHtml(money(group.net))}</strong></div>
            </div>
            <table>
              <thead>
                <tr><th>Tanggal</th><th>Klasifikasi</th><th>Deskripsi</th><th>Kas Masuk</th><th>Kas Keluar</th><th>Net</th></tr>
              </thead>
              <tbody>
                ${group.transactions.length === 0
                  ? '<tr><td colspan="6" class="center">Zero balance</td></tr>'
                  : group.transactions.map((transaction) => `
                    <tr>
                      <td>${escapeHtml(formatDate(transaction.created_at))}</td>
                      <td>${escapeHtml(formatCategory(transaction.category))}</td>
                      <td>${escapeHtml(transaction.description)}</td>
                      <td class="number">${getCashInAmount(transaction) > 0 ? escapeHtml(money(getCashInAmount(transaction))) : '-'}</td>
                      <td class="number">${getCashOutAmount(transaction) > 0 ? escapeHtml(money(getCashOutAmount(transaction))) : '-'}</td>
                      <td class="number">${escapeHtml(money(getCashFlowSignedAmount(transaction)))}</td>
                    </tr>
                  `).join('')}
              </tbody>
            </table>
          </section>
        `).join('')}
    </div>
  `;

  const buildHtmlDocument = () => `<!doctype html>
<html lang="${locale}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml('Laporan Arus Kas')}</title>
  <style>
    @page { size: A4 landscape; margin: 12mm; }
    * { box-sizing: border-box; }
    body { margin: 0; background: #f3f4f6; color: #111827; font-family: Arial, sans-serif; padding: 24px; }
    .report { background: #fff; border: 1px solid #e5e7eb; margin: 0 auto; min-width: 980px; padding: 24px; width: max-content; }
    .report-header { border-bottom: 2px solid #111827; display: flex; gap: 16px; justify-content: space-between; margin-bottom: 18px; padding-bottom: 12px; }
    .company { font-size: 16px; font-weight: 700; }
    .muted, .title p, .group-header span { color: #4b5563; font-size: 13px; }
    .meta { font-size: 13px; line-height: 1.6; text-align: right; white-space: nowrap; }
    .title { margin-bottom: 18px; text-align: center; }
    .title h1 { font-size: 18px; margin: 0; text-transform: uppercase; }
    .total-grid { border: 1px solid #111827; display: grid; font-weight: 700; grid-template-columns: 1fr 180px 180px 180px; margin-bottom: 18px; }
    .total-grid div, .group-header div { padding: 10px 12px; }
    .total-grid div:not(:first-child), .group-header div:not(:first-child) { text-align: right; }
    .group { border: 1px solid #d1d5db; break-inside: avoid; margin-bottom: 16px; }
    .group-header { background: #f3f4f6; border-bottom: 1px solid #d1d5db; display: grid; gap: 12px; grid-template-columns: 1fr 150px 150px 150px; }
    .group-header span { display: block; }
    table { border-collapse: collapse; table-layout: fixed; width: 100%; }
    th, td { border: 1px solid #d1d5db; font-size: 13px; padding: 8px 10px; }
    th { background: #f9fafb; text-align: left; }
    th:nth-child(n+4), .number { text-align: right; white-space: nowrap; }
    .center, .empty { text-align: center; }
    .empty { border: 1px solid #d1d5db; padding: 16px; }
    @media print { body { background: #fff; padding: 0; } }
  </style>
</head>
<body>
  ${buildFullReportMarkup()}
</body>
</html>`;

  const handleExportCsv = async (target: ExportTarget = 'auto') => {
    try {
      const exported = await exportCsv({ filename: `${filenameBase}.csv`, rows: buildCsvRows(), target });
      if (exported) message.success('Export CSV arus kas berhasil.');
    } catch (error) {
      console.error('Failed to export cash flow CSV:', error);
      message.error('Gagal export CSV arus kas.');
    }
  };

  const handleExportHtml = async (target: ExportTarget = 'auto') => {
    try {
      const exported = await saveExportFile({
        filename: `${filenameBase}.html`,
        mimeType: 'text/html',
        content: buildHtmlDocument(),
        target,
      });
      if (exported) message.success('Export HTML arus kas berhasil.');
    } catch (error) {
      console.error('Failed to export cash flow HTML:', error);
      message.error('Gagal export HTML arus kas.');
    }
  };

  const handleExportPdf = async (target: ExportTarget = 'auto') => {
    try {
      const exported = await exportPdf({
        filename: `${filenameBase}.pdf`,
        orientation: 'landscape',
        target,
        build: (doc) => {
          const pageWidth = doc.internal.pageSize.getWidth();
          const pageHeight = doc.internal.pageSize.getHeight();
          let currentY = 18;

          doc.setFontSize(14);
          doc.setFont('helvetica', 'bold');
          doc.text(companyName, 14, currentY);
          doc.text('Laporan Arus Kas', pageWidth / 2, currentY, { align: 'center' });
          currentY += 7;
          doc.setFontSize(9);
          doc.setFont('helvetica', 'normal');
          doc.text(`Periode: ${periodText}`, 14, currentY);
          doc.text(`Mata Uang: ${currencyCode}`, pageWidth / 2, currentY, { align: 'center' });
          doc.text(`Tanggal Cetak: ${printDateText}`, pageWidth - 14, currentY, { align: 'right' });
          currentY += 8;
          doc.text(`Klasifikasi: ${classificationText}`, 14, currentY);
          currentY += 8;

          autoTable(doc, {
            startY: currentY,
            head: [['Total', 'Kas Masuk', 'Kas Keluar', 'Net']],
            body: [['', money(totals.cashIn), money(totals.cashOut), money(totals.net)]],
            theme: 'grid',
            styles: { fontSize: 8, cellPadding: 2 },
            headStyles: { fillColor: [17, 24, 39], textColor: 255 },
            columnStyles: {
              1: { halign: 'right' },
              2: { halign: 'right' },
              3: { halign: 'right' },
            },
          });
          currentY = ((doc as unknown as JsPdfWithAutoTable).lastAutoTable?.finalY ?? currentY) + 8;

          groups.forEach((group) => {
            if (currentY > pageHeight - 36) {
              doc.addPage();
              currentY = 18;
            }

            doc.setFontSize(10);
            doc.setFont('helvetica', 'bold');
            doc.text(`${getAccountLabel(group)} (${group.transactions.length} transaksi)`, 14, currentY);
            currentY += 5;

            autoTable(doc, {
              startY: currentY,
              head: [['Tanggal', 'Klasifikasi', 'Deskripsi', 'Kas Masuk', 'Kas Keluar', 'Net']],
              body: group.transactions.length === 0
                ? [['Zero balance', '', '', '', '', '']]
                : group.transactions.map((transaction) => [
                  dayjs(transaction.created_at).tz().format('YYYY-MM-DD HH:mm'),
                  formatCategory(transaction.category),
                  transaction.description || '-',
                  getCashInAmount(transaction) > 0 ? money(getCashInAmount(transaction)) : '-',
                  getCashOutAmount(transaction) > 0 ? money(getCashOutAmount(transaction)) : '-',
                  money(getCashFlowSignedAmount(transaction)),
                ]),
              foot: [[
                'Subtotal',
                '',
                '',
                money(group.cashIn),
                money(group.cashOut),
                money(group.net),
              ]],
              theme: 'grid',
              styles: { fontSize: 7, cellPadding: 1.8, overflow: 'linebreak' },
              headStyles: { fillColor: [243, 244, 246], textColor: 17, fontStyle: 'bold' },
              footStyles: { fillColor: [249, 250, 251], textColor: 17, fontStyle: 'bold' },
              columnStyles: {
                0: { cellWidth: 34 },
                1: { cellWidth: 44 },
                2: { cellWidth: 92 },
                3: { halign: 'right', cellWidth: 34 },
                4: { halign: 'right', cellWidth: 34 },
                5: { halign: 'right', cellWidth: 34 },
              },
              margin: { left: 14, right: 14 },
            });
            currentY = ((doc as unknown as JsPdfWithAutoTable).lastAutoTable?.finalY ?? currentY) + 8;
          });
        },
      });
      if (exported) message.success('Export PDF arus kas berhasil.');
    } catch (error) {
      console.error('Failed to export cash flow PDF:', error);
      message.error('Gagal export PDF arus kas.');
    }
  };

  const handleShortcutChange = (value: CashFlowDateShortcut) => {
    setDateShortcut(value);
    if (value !== 'CUSTOM') setDateRange(getDateRange(value));
  };

  if (reportQuery.isLoading) return <Loading />;

  if (reportQuery.error) {
    return (
      <div className="p-3 sm:p-4 md:p-6">
        <Card>
          <Text type="danger">
            {reportQuery.error instanceof Error ? reportQuery.error.message : 'Gagal memuat laporan arus kas.'}
          </Text>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-3 sm:p-4 md:p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <Title level={2} className="!mb-1">Laporan Arus Kas</Title>
          <Text type="secondary">Pantau arus kas masuk dan keluar per akun kas/bank.</Text>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            icon={<ReloadOutlined />}
            onClick={() => recalculateMutation.mutate()}
            loading={recalculateMutation.isPending}
          >
            {t('finance.recalculate')}
          </Button>
          <ExportActions
            buttonType="default"
            disabled={groups.length === 0}
            formats={[
              { key: 'pdf', label: 'PDF', icon: <FilePdfOutlined />, onExport: handleExportPdf },
              { key: 'html', label: 'HTML', icon: <FileTextOutlined />, onExport: handleExportHtml },
              { key: 'csv', label: 'CSV', icon: <FileTextOutlined />, onExport: handleExportCsv },
            ]}
          />
        </div>
      </div>

      <Card className="shadow-sm" styles={{ body: { padding: isMobile ? 12 : undefined } }}>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[260px_170px_220px_260px_180px]">
          <div>
            <Text strong>Periode</Text>
            <DatePicker.RangePicker
              className="mt-2 w-full"
              value={dateRange}
              format="YYYY-MM-DD"
              presets={[
                { label: 'Bulan Ini', value: getDateRange('THIS_MONTH') },
                { label: 'Bulan Lalu', value: getDateRange('LAST_MONTH') },
                { label: 'Tahun Ini', value: getDateRange('THIS_YEAR') },
              ]}
              onChange={(value) => {
                if (!value?.[0] || !value?.[1]) return;
                setDateShortcut('CUSTOM');
                setDateRange([value[0], value[1]]);
              }}
            />
          </div>
          <div>
            <Text strong>Shortcut</Text>
            <Select
              className="mt-2 w-full"
              value={dateShortcut}
              options={[
                { value: 'THIS_MONTH', label: 'Bulan Ini' },
                { value: 'LAST_MONTH', label: 'Bulan Lalu' },
                { value: 'THIS_YEAR', label: 'Tahun Ini' },
                { value: 'CUSTOM', label: 'Custom' },
              ]}
              onChange={handleShortcutChange}
            />
          </div>
          <div>
            <Text strong>Mata Uang</Text>
            <Select
              className="mt-2 w-full"
              value={currencyCode}
              options={[{ value: baseCurrencyCode, label: `${baseCurrencyCode} - ${baseCurrency.name}` }]}
              onChange={setCurrencyCode}
            />
          </div>
          <div>
            <Text strong>Klasifikasi</Text>
            <Select
              showSearch
              optionFilterProp="label"
              className="mt-2 w-full"
              value={classification}
              options={classificationOptions}
              onChange={setClassification}
            />
          </div>
          <div className="flex items-end pb-1">
            <Checkbox checked={showZeroBalance} onChange={(event) => setShowZeroBalance(event.target.checked)}>
              Show zero balance
            </Checkbox>
          </div>
        </div>
      </Card>

      <div style={{ overflowX: 'auto' }}>
        <div
          data-testid="cash-flow-report"
          style={{
            background: '#ffffff',
            border: '1px solid #e5e7eb',
            color: '#111827',
            fontFamily: 'Arial, sans-serif',
            minWidth: 980,
            padding: 24,
          }}
        >
          <div style={{ borderBottom: '2px solid #111827', display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 18, paddingBottom: 12 }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{companyName}</div>
              <div style={{ color: '#4b5563', fontSize: 13, marginTop: 2 }}>Laporan Keuangan</div>
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.6, textAlign: 'right', whiteSpace: 'nowrap' }}>
              <div>Periode: {periodText}</div>
              <div>Mata Uang: {currencyCode}</div>
              <div>Tanggal Cetak: {printDateText}</div>
            </div>
          </div>

          <div style={{ marginBottom: 18, textAlign: 'center' }}>
            <div style={{ fontSize: 18, fontWeight: 700, textTransform: 'uppercase' }}>Laporan Arus Kas</div>
            <div style={{ color: '#4b5563', fontSize: 13, marginTop: 4 }}>{classificationText}</div>
          </div>

          <div style={{ border: '1px solid #111827', display: 'grid', gridTemplateColumns: '1fr 180px 180px 180px', marginBottom: 18 }}>
            <div style={{ fontWeight: 700, padding: '10px 12px' }}>Total</div>
            <div style={{ fontWeight: 700, padding: '10px 12px', textAlign: 'right' }}>{money(totals.cashIn)}</div>
            <div style={{ fontWeight: 700, padding: '10px 12px', textAlign: 'right' }}>{money(totals.cashOut)}</div>
            <div style={{ color: totals.net < 0 ? '#dc2626' : '#111827', fontWeight: 700, padding: '10px 12px', textAlign: 'right' }}>{money(totals.net)}</div>
          </div>

          {groups.length === 0 ? (
            <div style={{ border: '1px solid #d1d5db', padding: 16, textAlign: 'center' }}>Belum ada transaksi arus kas untuk filter ini.</div>
          ) : groups.map((group) => (
            <CashFlowGroupSection
              key={group.key}
              group={group}
              formatCategory={formatCategory}
              money={money}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
