import { FilePdfOutlined, FileTextOutlined, ReloadOutlined } from '@ant-design/icons';
import { App, Button, Card, Checkbox, DatePicker, Select, Typography } from 'antd';
import type { Dayjs } from 'dayjs';
import { useMemo, useRef, useState } from 'react';
import ExportActions from '@/components/ExportActions';
import { Loading } from '@/components/Loading';
import { getFinanceTransactionBusinessType } from '@/constants/finance';
import { useCashBankTransfer } from '@/hooks/useCashBankTransfer';
import { useCompanyProfileSetting } from '@/hooks/useCompanyProfileSetting';
import { useFinance } from '@/hooks/useFinance';
import { useI18n } from '@/hooks/useI18n';
import { useIsMobile } from '@/hooks/useIsMobile';
import { getFinanceCategoryLabel } from '@/i18n/finance';
import dayjs from '@/lib/dayjs';
import type { FinanceTransaction, FinanceTransactionType } from '@/types';
import { exportCsv, exportHtmlPdf, saveExportFile, type ExportRows, type ExportTarget } from '@/utils/export';
import { formatCurrency, formatDate } from '@/utils/formatters';

const { Text, Title } = Typography;
const ALL_VALUE = 'ALL';
const BASE_CURRENCY_CODE = 'IDR';

type CashFlowDateShortcut = 'THIS_MONTH' | 'LAST_MONTH' | 'THIS_YEAR' | 'CUSTOM';

type CashFlowGroup = {
  key: string;
  accountCode?: string;
  accountName: string;
  cashIn: number;
  cashOut: number;
  net: number;
  transactions: FinanceTransaction[];
};

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => {
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

const getCashFlowAccountKey = (transaction: FinanceTransaction) => (
  transaction.cash_account_id ?? transaction.account_id ?? 'UNMAPPED'
);

const getCashFlowAccountName = (transaction: FinanceTransaction) => (
  transaction.cash_account_name ?? transaction.account_name ?? 'Tanpa Akun'
);

const getCashFlowAccountCode = (transaction: FinanceTransaction) => (
  transaction.cash_account_code ?? transaction.account_code
);

const getSignedAmount = (transaction: FinanceTransaction) => (
  getFinanceTransactionBusinessType(transaction) === 'EXPENSE'
    ? -Number(transaction.amount || 0)
    : Number(transaction.amount || 0)
);

export default function CashFlowReport() {
  const { message } = App.useApp();
  const { t, locale } = useI18n();
  const isMobile = useIsMobile();
  const { profile } = useCompanyProfileSetting();
  const { transactions, isLoading, recalculate, isRecalculating } = useFinance();
  const { cashBankAccounts } = useCashBankTransfer();
  const reportRef = useRef<HTMLDivElement | null>(null);
  const [dateShortcut, setDateShortcut] = useState<CashFlowDateShortcut>('THIS_MONTH');
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs]>(() => getDateRange('THIS_MONTH'));
  const [currencyCode, setCurrencyCode] = useState(BASE_CURRENCY_CODE);
  const [classification, setClassification] = useState(ALL_VALUE);
  const [showZeroBalance, setShowZeroBalance] = useState(false);

  const classificationOptions = useMemo(() => {
    const categories = Array.from(new Set(transactions.map((transaction) => transaction.category))).sort();
    return [
      { value: ALL_VALUE, label: 'Semua Klasifikasi' },
      { value: 'TYPE:INCOME', label: t('finance.income') },
      { value: 'TYPE:EXPENSE', label: t('finance.expense') },
      { value: 'TYPE:OPENING_BALANCE', label: t('finance.openingBalance') },
      ...categories.map((category) => ({
        value: `CATEGORY:${category}`,
        label: getFinanceCategoryLabel(category, t),
      })),
    ];
  }, [t, transactions]);

  const filteredTransactions = useMemo(() => {
    const startDate = dateRange[0].startOf('day');
    const endDate = dateRange[1].endOf('day');

    return transactions
      .filter((transaction) => {
        const transactionDate = dayjs(transaction.created_at).tz();
        if (transactionDate.isBefore(startDate) || transactionDate.isAfter(endDate)) return false;
        if (currencyCode !== BASE_CURRENCY_CODE) return false;

        if (classification.startsWith('TYPE:')) {
          const type = classification.replace('TYPE:', '') as FinanceTransactionType;
          return getFinanceTransactionBusinessType(transaction) === type;
        }

        if (classification.startsWith('CATEGORY:')) {
          return transaction.category === classification.replace('CATEGORY:', '');
        }

        return true;
      })
      .sort((left, right) => left.created_at.localeCompare(right.created_at));
  }, [classification, currencyCode, dateRange, transactions]);

  const groups = useMemo<CashFlowGroup[]>(() => {
    const groupMap = new Map<string, CashFlowGroup>();

    if (showZeroBalance) {
      cashBankAccounts.forEach((account) => {
        groupMap.set(account.id, {
          key: account.id,
          accountCode: account.code,
          accountName: account.name,
          cashIn: 0,
          cashOut: 0,
          net: 0,
          transactions: [],
        });
      });
    }

    filteredTransactions.forEach((transaction) => {
      const key = getCashFlowAccountKey(transaction);
      const signedAmount = getSignedAmount(transaction);
      const current = groupMap.get(key) ?? {
        key,
        accountCode: getCashFlowAccountCode(transaction),
        accountName: getCashFlowAccountName(transaction),
        cashIn: 0,
        cashOut: 0,
        net: 0,
        transactions: [],
      };

      current.transactions.push(transaction);
      if (signedAmount >= 0) current.cashIn += signedAmount;
      else current.cashOut += Math.abs(signedAmount);
      current.net = current.cashIn - current.cashOut;
      groupMap.set(key, current);
    });

    return Array.from(groupMap.values())
      .filter((group) => showZeroBalance || group.transactions.length > 0 || Math.abs(group.net) > 0)
      .sort((left, right) => `${left.accountCode ?? ''}${left.accountName}`.localeCompare(`${right.accountCode ?? ''}${right.accountName}`, undefined, { numeric: true }));
  }, [cashBankAccounts, filteredTransactions, showZeroBalance]);

  const totals = useMemo(() => groups.reduce((acc, group) => {
    acc.cashIn += group.cashIn;
    acc.cashOut += group.cashOut;
    acc.net += group.net;
    return acc;
  }, { cashIn: 0, cashOut: 0, net: 0 }), [groups]);

  const periodText = `${dateRange[0].format('YYYY-MM-DD')} - ${dateRange[1].format('YYYY-MM-DD')}`;
  const classificationText = classificationOptions.find((option) => option.value === classification)?.label ?? 'Semua Klasifikasi';
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
        group.accountCode ? `${group.accountCode} - ${group.accountName}` : group.accountName,
        '',
        'Subtotal Akun',
        '',
        group.cashIn,
        group.cashOut,
        group.net,
      ]);
      group.transactions.forEach((transaction) => {
        const signedAmount = getSignedAmount(transaction);
        rows.push([
          '',
          dayjs(transaction.created_at).tz().format('YYYY-MM-DD HH:mm'),
          getFinanceCategoryLabel(transaction.category, t),
          transaction.description,
          signedAmount >= 0 ? signedAmount : 0,
          signedAmount < 0 ? Math.abs(signedAmount) : 0,
          signedAmount,
        ]);
      });
    });

    rows.push([]);
    rows.push(['Total', '', '', '', totals.cashIn, totals.cashOut, totals.net]);
    return rows;
  };

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
    .report-shell { margin: 0 auto; width: max-content; }
    @media print { body { background: #fff; padding: 0; } }
  </style>
</head>
<body>
  <main class="report-shell">${reportRef.current?.outerHTML ?? ''}</main>
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
    if (!reportRef.current) return;
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
    if (!reportRef.current) return;
    try {
      const exported = await exportHtmlPdf({
        filename: `${filenameBase}.pdf`,
        element: reportRef.current,
        orientation: 'landscape',
        target,
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

  if (isLoading) return <Loading />;

  return (
    <div className="space-y-4 p-3 sm:p-4 md:p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <Title level={2} className="!mb-1">Laporan Arus Kas</Title>
          <Text type="secondary">Pantau arus kas masuk dan keluar per akun kas/bank.</Text>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button icon={<ReloadOutlined />} onClick={() => recalculate()} loading={isRecalculating}>
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
              options={[{ value: BASE_CURRENCY_CODE, label: 'IDR - Rupiah Indonesia' }]}
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
          ref={reportRef}
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
            <div style={{ fontWeight: 700, padding: '10px 12px', textAlign: 'right' }}>Rp {formatCurrency(totals.cashIn)}</div>
            <div style={{ fontWeight: 700, padding: '10px 12px', textAlign: 'right' }}>Rp {formatCurrency(totals.cashOut)}</div>
            <div style={{ color: totals.net < 0 ? '#dc2626' : '#111827', fontWeight: 700, padding: '10px 12px', textAlign: 'right' }}>Rp {formatCurrency(totals.net)}</div>
          </div>

          {groups.length === 0 ? (
            <div style={{ border: '1px solid #d1d5db', padding: 16, textAlign: 'center' }}>Belum ada transaksi arus kas untuk filter ini.</div>
          ) : groups.map((group) => (
            <section key={group.key} style={{ border: '1px solid #d1d5db', breakInside: 'avoid', marginBottom: 16 }}>
              <div style={{ background: '#f3f4f6', borderBottom: '1px solid #d1d5db', display: 'grid', gap: 12, gridTemplateColumns: '1fr 150px 150px 150px', padding: '10px 12px' }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{group.accountCode ? `${group.accountCode} - ${group.accountName}` : group.accountName}</div>
                  <div style={{ color: '#6b7280', fontSize: 12 }}>{group.transactions.length} transaksi</div>
                </div>
                <div style={{ textAlign: 'right' }}><div style={{ color: '#4b5563', fontSize: 12 }}>Kas Masuk</div><strong>Rp {formatCurrency(group.cashIn)}</strong></div>
                <div style={{ textAlign: 'right' }}><div style={{ color: '#4b5563', fontSize: 12 }}>Kas Keluar</div><strong>Rp {formatCurrency(group.cashOut)}</strong></div>
                <div style={{ textAlign: 'right' }}><div style={{ color: '#4b5563', fontSize: 12 }}>Net</div><strong style={{ color: group.net < 0 ? '#dc2626' : '#111827' }}>Rp {formatCurrency(group.net)}</strong></div>
              </div>
              <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed', width: '100%' }}>
                <colgroup>
                  <col style={{ width: 145 }} />
                  <col style={{ width: 180 }} />
                  <col />
                  <col style={{ width: 140 }} />
                  <col style={{ width: 140 }} />
                  <col style={{ width: 140 }} />
                </colgroup>
                <thead>
                  <tr>
                    {['Tanggal', 'Klasifikasi', 'Deskripsi', 'Kas Masuk', 'Kas Keluar', 'Net'].map((label) => (
                      <th key={label} style={{ background: '#f9fafb', border: '1px solid #d1d5db', fontSize: 13, padding: '8px 10px', textAlign: label.startsWith('Kas') || label === 'Net' ? 'right' : 'left' }}>{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {group.transactions.length === 0 ? (
                    <tr><td colSpan={6} style={{ border: '1px solid #d1d5db', fontSize: 13, padding: '8px 10px', textAlign: 'center' }}>Zero balance</td></tr>
                  ) : group.transactions.map((transaction) => {
                    const signedAmount = getSignedAmount(transaction);
                    return (
                      <tr key={transaction.id}>
                        <td style={{ border: '1px solid #d1d5db', fontSize: 13, padding: '8px 10px' }}>{formatDate(transaction.created_at)}</td>
                        <td style={{ border: '1px solid #d1d5db', fontSize: 13, padding: '8px 10px' }}>{getFinanceCategoryLabel(transaction.category, t)}</td>
                        <td style={{ border: '1px solid #d1d5db', fontSize: 13, padding: '8px 10px' }}>{transaction.description}</td>
                        <td style={{ border: '1px solid #d1d5db', fontSize: 13, padding: '8px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>{signedAmount >= 0 ? `Rp ${formatCurrency(signedAmount)}` : '-'}</td>
                        <td style={{ border: '1px solid #d1d5db', fontSize: 13, padding: '8px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>{signedAmount < 0 ? `Rp ${formatCurrency(Math.abs(signedAmount))}` : '-'}</td>
                        <td style={{ border: '1px solid #d1d5db', color: signedAmount < 0 ? '#dc2626' : '#111827', fontSize: 13, padding: '8px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>Rp {formatCurrency(signedAmount)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
