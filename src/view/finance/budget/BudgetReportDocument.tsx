import { forwardRef, type CSSProperties } from 'react';
import { Building2 } from 'lucide-react';
import { useBaseCurrency } from '@/hooks/useBaseCurrency';
import { useI18n } from '@/hooks/useI18n';
import dayjs from '@/lib/dayjs';
import type { BudgetReportData } from '@/services/budgetReportService';
import { formatCurrency } from '@/utils/formatters';
import {
  BUDGET_STATUS_LABEL_KEY,
  PROJECTED_BUDGET_STATUS_LABEL_KEY,
  formatBudgetPeriodLabel,
} from './budgetFormatters';

type BudgetReportDocumentProps = {
  report: BudgetReportData;
  companyName: string;
  logoDataUrl?: string;
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
  borderTop: '1px solid #d1d5db',
  minHeight: 64,
  padding: '10px 12px',
};

const summaryLabelStyle: CSSProperties = {
  color: '#4b5563',
  fontSize: 11,
  fontWeight: 700,
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

const BudgetReportDocument = forwardRef<HTMLDivElement, BudgetReportDocumentProps>(
  function BudgetReportDocument({ report, companyName, logoDataUrl, printDateText }, ref) {
    const { t } = useI18n();
    const { baseCurrencySymbol } = useBaseCurrency();
    const money = (value: number) => `${baseCurrencySymbol} ${formatCurrency(value || 0)}`;
    const { budget, realization, realizedTransactions, plannedCommitments, cancelledCommitments } = report;
    const paymentMethodLabel = (method?: string) => (method === 'NON_TUNAI' ? t('payment.nonCash') : t('payment.cash'));

    return (
      <div ref={ref} style={reportWrapperStyle} data-testid="budget-report-document">
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
                {t('budget.report.subtitle')}
              </div>
            </div>
          </div>
          <div style={reportMetaStyle}>
            <div>{t('budget.title')}: {budget.name}</div>
            <div>{t('report.periodWithColon')} {formatBudgetPeriodLabel(budget)}</div>
            <div>{t('report.printDate')} {printDateText}</div>
          </div>
        </div>

        <div style={{ marginBottom: 20, textAlign: 'center' }}>
          <div style={{ fontSize: 20, fontWeight: 700, textTransform: 'uppercase' }}>
            {t('budget.report.title')}
          </div>
        </div>

        <div style={summaryGridStyle}>
          <div style={{ ...summaryCellStyle, borderTop: 0 }}>
            <div style={summaryLabelStyle}>{t('budget.commitment.plannedAmount')}</div>
            <div style={summaryValueStyle}>{money(budget.planned_amount)}</div>
          </div>
          <div style={{ ...summaryCellStyle, borderTop: 0 }}>
            <div style={summaryLabelStyle}>{t('budget.commitment.actualAmount')}</div>
            <div style={summaryValueStyle}>{money(realization.actual_amount)}</div>
          </div>
          <div style={{ ...summaryCellStyle, borderRight: 0, borderTop: 0 }}>
            <div style={summaryLabelStyle}>{t('budget.commitment.committedAmount')}</div>
            <div style={summaryValueStyle}>{money(realization.committed_amount)}</div>
          </div>
          <div style={summaryCellStyle}>
            <div style={summaryLabelStyle}>{t('budget.commitment.availableAmount')}</div>
            <div style={summaryValueStyle}>{money(realization.available_amount)}</div>
          </div>
          <div style={summaryCellStyle}>
            <div style={summaryLabelStyle}>{t('budget.table.status')}</div>
            <div style={summaryValueStyle}>{t(BUDGET_STATUS_LABEL_KEY[realization.status])}</div>
          </div>
          <div style={{ ...summaryCellStyle, borderRight: 0 }}>
            <div style={summaryLabelStyle}>{t('budget.report.projectedStatusLabel')}</div>
            <div style={summaryValueStyle}>{t(PROJECTED_BUDGET_STATUS_LABEL_KEY[realization.projected_status])}</div>
          </div>
        </div>

        <section style={{ breakInside: 'avoid', marginBottom: 18 }}>
          <h3 style={sectionTitleStyle}>{t('budget.report.realizedTransactionsTitle')}</h3>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={{ ...headerCellStyle, width: '18%' }}>{t('report.dateTime')}</th>
                <th style={{ ...headerCellStyle, textAlign: 'left', width: '42%' }}>
                  {t('report.descriptionLong')}
                </th>
                <th style={{ ...headerCellStyle, width: '18%' }}>{t('checkout.method')}</th>
                <th style={headerCellStyle}>{t('report.amount')}</th>
              </tr>
            </thead>
            <tbody>
              {realizedTransactions.length ? realizedTransactions.map((transaction) => (
                <tr key={transaction.id}>
                  <td style={cellStyle}>
                    {dayjs(transaction.created_at).tz().format('YYYY-MM-DD HH:mm')}
                  </td>
                  <td style={cellStyle}>{transaction.description || '-'}</td>
                  <td style={cellStyle}>{paymentMethodLabel(transaction.payment_method)}</td>
                  <td style={numberCellStyle}>{money(transaction.amount)}</td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={4} style={{ ...cellStyle, textAlign: 'center' }}>
                    {t('budget.report.noRealizedTransactions')}
                  </td>
                </tr>
              )}
              <tr style={{ background: '#f9fafb', fontWeight: 700 }}>
                <td colSpan={3} style={cellStyle}>{t('report.totalOverall')}</td>
                <td style={numberCellStyle}>{money(realization.actual_amount)}</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section style={{ breakInside: 'avoid', marginBottom: 18 }}>
          <h3 style={sectionTitleStyle}>{t('budget.report.plannedCommitmentsTitle')}</h3>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={{ ...headerCellStyle, textAlign: 'left', width: '46%' }}>
                  {t('budget.commitment.description')}
                </th>
                <th style={{ ...headerCellStyle, textAlign: 'left', width: '34%' }}>
                  {t('budget.commitment.notes')}
                </th>
                <th style={headerCellStyle}>{t('budget.commitment.amount')}</th>
              </tr>
            </thead>
            <tbody>
              {plannedCommitments.length ? plannedCommitments.map((commitment) => (
                <tr key={commitment.id}>
                  <td style={cellStyle}>{commitment.description}</td>
                  <td style={cellStyle}>{commitment.notes || '-'}</td>
                  <td style={numberCellStyle}>{money(commitment.amount)}</td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={3} style={{ ...cellStyle, textAlign: 'center' }}>
                    {t('budget.report.noPlannedCommitments')}
                  </td>
                </tr>
              )}
              <tr style={{ background: '#f9fafb', fontWeight: 700 }}>
                <td colSpan={2} style={cellStyle}>{t('report.totalOverall')}</td>
                <td style={numberCellStyle}>{money(realization.committed_amount)}</td>
              </tr>
            </tbody>
          </table>
        </section>

        {cancelledCommitments.length > 0 ? (
          <section style={{ breakInside: 'avoid' }}>
            <h3 style={sectionTitleStyle}>{t('budget.report.cancelledCommitmentsTitle')}</h3>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={{ ...headerCellStyle, textAlign: 'left', width: '46%' }}>
                    {t('budget.commitment.description')}
                  </th>
                  <th style={{ ...headerCellStyle, width: '20%' }}>{t('budget.commitment.resolvedAt')}</th>
                  <th style={headerCellStyle}>{t('budget.commitment.amount')}</th>
                </tr>
              </thead>
              <tbody>
                {cancelledCommitments.map((commitment) => (
                  <tr key={commitment.id}>
                    <td style={cellStyle}>{commitment.description}</td>
                    <td style={cellStyle}>
                      {commitment.resolved_at ? dayjs(commitment.resolved_at).format('YYYY-MM-DD') : '-'}
                    </td>
                    <td style={numberCellStyle}>{money(commitment.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ) : null}
      </div>
    );
  },
);

export default BudgetReportDocument;
