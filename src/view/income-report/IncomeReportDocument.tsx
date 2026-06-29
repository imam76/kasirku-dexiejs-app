import { forwardRef, type CSSProperties } from 'react';
import { Building2 } from 'lucide-react';
import { getFinanceCategoryLabel } from '@/i18n/finance';
import { useI18n } from '@/hooks/useI18n';
import dayjs from '@/lib/dayjs';
import type { FinanceTransaction } from '@/types';
import { formatCurrency } from '@/utils/formatters';

type IncomeReportDocumentProps = {
  transactions: FinanceTransaction[];
  totalIncome: number;
  breakdown: Record<string, number>;
  companyName: string;
  logoDataUrl?: string;
  periodText: string;
  categoryText: string;
  printDateText: string;
};

const reportWrapperStyle: CSSProperties = {
  background: '#ffffff',
  border: '1px solid #e5e7eb',
  color: '#111827',
  fontFamily: 'Arial, sans-serif',
  minWidth: 840,
  padding: 24,
};

const reportHeaderStyle: CSSProperties = {
  borderBottom: '2px solid #111827',
  display: 'flex',
  gap: 16,
  justifyContent: 'space-between',
  marginBottom: 18,
  paddingBottom: 12,
};

const reportIdentityStyle: CSSProperties = {
  alignItems: 'center',
  display: 'flex',
  gap: 12,
  minWidth: 0,
};

const reportLogoStyle: CSSProperties = {
  alignItems: 'center',
  border: '1px solid #d1d5db',
  display: 'flex',
  flexShrink: 0,
  height: 54,
  justifyContent: 'center',
  overflow: 'hidden',
  width: 54,
};

const reportMetaStyle: CSSProperties = {
  fontSize: 12,
  lineHeight: 1.6,
  textAlign: 'right',
  whiteSpace: 'nowrap',
};

const summaryGridStyle: CSSProperties = {
  border: '1px solid #d1d5db',
  display: 'grid',
  gridTemplateColumns: 'repeat(3, 1fr)',
  marginBottom: 18,
};

const summaryCellStyle: CSSProperties = {
  borderRight: '1px solid #d1d5db',
  minHeight: 64,
  padding: '10px 12px',
};

const summaryLabelStyle: CSSProperties = {
  color: '#4b5563',
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: 0,
  textTransform: 'uppercase',
};

const summaryValueStyle: CSSProperties = {
  fontSize: 15,
  fontWeight: 700,
  marginTop: 8,
  textAlign: 'right',
};

const sectionTitleStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  margin: '0 0 8px',
  textTransform: 'uppercase',
};

const tableStyle: CSSProperties = {
  borderCollapse: 'collapse',
  tableLayout: 'fixed',
  width: '100%',
};

const cellStyle: CSSProperties = {
  border: '1px solid #9ca3af',
  fontSize: 12,
  padding: '9px 10px',
  verticalAlign: 'top',
};

const headerCellStyle: CSSProperties = {
  ...cellStyle,
  background: '#f3f4f6',
  fontWeight: 700,
  textAlign: 'center',
};

const numberCellStyle: CSSProperties = {
  ...cellStyle,
  textAlign: 'right',
  whiteSpace: 'nowrap',
};

const money = (value: number) => `Rp ${formatCurrency(value || 0)}`;

const IncomeReportDocument = forwardRef<HTMLDivElement, IncomeReportDocumentProps>(
  function IncomeReportDocument({
    transactions,
    totalIncome,
    breakdown,
    companyName,
    logoDataUrl,
    periodText,
    categoryText,
    printDateText,
  }, ref) {
    const { t } = useI18n();
    const breakdownRows = Object.entries(breakdown)
      .sort(([, firstAmount], [, secondAmount]) => secondAmount - firstAmount);

    return (
      <div ref={ref} style={reportWrapperStyle} data-testid="income-report-document">
        <div style={reportHeaderStyle}>
          <div style={reportIdentityStyle}>
            <div style={reportLogoStyle}>
              {logoDataUrl ? (
                <img
                  src={logoDataUrl}
                  alt={companyName}
                  style={{ height: '100%', objectFit: 'contain', width: '100%' }}
                />
              ) : (
                <Building2 size={28} color="#9ca3af" />
              )}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{companyName}</div>
              <div style={{ color: '#4b5563', fontSize: 13, marginTop: 2 }}>
                {t('report.income.subtitle')}
              </div>
            </div>
          </div>
          <div style={reportMetaStyle}>
            <div>{t('report.periodWithColon')} {periodText}</div>
            <div>{t('report.incomeCategory')}: {categoryText}</div>
            <div>{t('report.printDate')} {printDateText}</div>
          </div>
        </div>

        <div style={{ marginBottom: 20, textAlign: 'center' }}>
          <div style={{ fontSize: 20, fontWeight: 700, textTransform: 'uppercase' }}>
            {t('report.income.title')}
          </div>
        </div>

        <div style={summaryGridStyle}>
          <div style={summaryCellStyle}>
            <div style={summaryLabelStyle}>{t('report.totalTransactions')}</div>
            <div style={summaryValueStyle}>
              {transactions.length} {t('report.trxSuffix')}
            </div>
          </div>
          <div style={summaryCellStyle}>
            <div style={summaryLabelStyle}>{t('report.incomeCategory')}</div>
            <div style={summaryValueStyle}>{breakdownRows.length}</div>
          </div>
          <div style={{ ...summaryCellStyle, borderRight: 0 }}>
            <div style={summaryLabelStyle}>{t('finance.totalIncome')}</div>
            <div style={summaryValueStyle}>{money(totalIncome)}</div>
          </div>
        </div>

        <section style={{ breakInside: 'avoid', marginBottom: 18 }}>
          <h3 style={sectionTitleStyle}>{t('report.income.categorySummary')}</h3>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={{ ...headerCellStyle, textAlign: 'left', width: '70%' }}>
                  {t('report.category')}
                </th>
                <th style={headerCellStyle}>{t('report.amount')}</th>
              </tr>
            </thead>
            <tbody>
              {breakdownRows.length ? breakdownRows.map(([category, amount]) => (
                <tr key={category}>
                  <td style={cellStyle}>{getFinanceCategoryLabel(category, t)}</td>
                  <td style={numberCellStyle}>{money(amount)}</td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={2} style={{ ...cellStyle, textAlign: 'center' }}>
                    {t('report.noIncomeForPeriod')}
                  </td>
                </tr>
              )}
              <tr style={{ background: '#f9fafb', fontWeight: 700 }}>
                <td style={cellStyle}>{t('finance.totalIncome')}</td>
                <td style={numberCellStyle}>{money(totalIncome)}</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section>
          <h3 style={sectionTitleStyle}>{t('report.income.transactionDetails')}</h3>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={{ ...headerCellStyle, width: '17%' }}>{t('report.dateTime')}</th>
                <th style={{ ...headerCellStyle, textAlign: 'left', width: '39%' }}>
                  {t('report.descriptionLong')}
                </th>
                <th style={{ ...headerCellStyle, textAlign: 'left', width: '24%' }}>
                  {t('report.category')}
                </th>
                <th style={headerCellStyle}>{t('report.amount')}</th>
              </tr>
            </thead>
            <tbody>
              {transactions.length ? transactions.map((transaction) => (
                <tr key={transaction.id}>
                  <td style={cellStyle}>
                    {dayjs(transaction.created_at).tz().format('YYYY-MM-DD HH:mm')}
                  </td>
                  <td style={cellStyle}>{transaction.description || '-'}</td>
                  <td style={cellStyle}>{getFinanceCategoryLabel(transaction.category, t)}</td>
                  <td style={numberCellStyle}>{money(transaction.amount)}</td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={4} style={{ ...cellStyle, textAlign: 'center' }}>
                    {t('report.noIncomeForPeriod')}
                  </td>
                </tr>
              )}
              <tr style={{ background: '#f9fafb', fontWeight: 700 }}>
                <td colSpan={3} style={cellStyle}>{t('report.totalOverall')}</td>
                <td style={numberCellStyle}>{money(totalIncome)}</td>
              </tr>
            </tbody>
          </table>
        </section>
      </div>
    );
  },
);

export default IncomeReportDocument;
