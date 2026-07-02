import { forwardRef, type CSSProperties } from 'react';
import { Building2 } from 'lucide-react';
import { useI18n } from '@/hooks/useI18n';
import type { TranslationKey } from '@/i18n/messages';
import type {
  CooperativeCashFlowActivity,
  CooperativeCashFlowSection,
  CooperativeCashFlowStatement,
} from '@/services/cooperativeReportService';
import { formatCurrency, formatDate } from '@/utils/formatters';

type CooperativeCashFlowStatementReportProps = {
  statement?: CooperativeCashFlowStatement;
  companyName: string;
  logoDataUrl?: string;
  periodText: string;
  printDateText: string;
};

const REPORT_MIN_WIDTH = 1040;

const cashFlowActivityLabelKey: Record<CooperativeCashFlowActivity, TranslationKey> = {
  OPERATING: 'cooperative.reports.cashFlow.operating',
  INVESTING: 'cooperative.reports.cashFlow.investing',
  FINANCING: 'cooperative.reports.cashFlow.financing',
};

const emptySections: CooperativeCashFlowSection[] = [
  {
    activity: 'OPERATING',
    cash_in_amount: 0,
    cash_out_amount: 0,
    net_amount: 0,
    rows: [],
  },
  {
    activity: 'INVESTING',
    cash_in_amount: 0,
    cash_out_amount: 0,
    net_amount: 0,
    rows: [],
  },
  {
    activity: 'FINANCING',
    cash_in_amount: 0,
    cash_out_amount: 0,
    net_amount: 0,
    rows: [],
  },
];

const emptyStatement: CooperativeCashFlowStatement = {
  beginning_cash_amount: 0,
  operating_net_amount: 0,
  investing_net_amount: 0,
  financing_net_amount: 0,
  net_cash_change_amount: 0,
  ending_cash_amount: 0,
  sections: emptySections,
};

const reportWrapperStyle: CSSProperties = {
  background: '#ffffff',
  border: '1px solid #e5e7eb',
  color: '#111827',
  fontFamily: 'Arial, sans-serif',
  minWidth: REPORT_MIN_WIDTH,
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
  fontSize: 13,
  lineHeight: 1.6,
  textAlign: 'right',
  whiteSpace: 'nowrap',
};

const reportTitleStyle: CSSProperties = {
  marginBottom: 18,
  textAlign: 'center',
};

const summaryGridStyle: CSSProperties = {
  border: '1px solid #d1d5db',
  display: 'grid',
  gridTemplateColumns: 'repeat(3, 1fr)',
  marginBottom: 18,
};

const summaryCellStyle: CSSProperties = {
  borderBottom: '1px solid #d1d5db',
  borderRight: '1px solid #d1d5db',
  minHeight: 72,
  padding: '10px 12px',
};

const summaryLabelStyle: CSSProperties = {
  color: '#4b5563',
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: 0,
  textTransform: 'uppercase',
};

const summaryValueStyle: CSSProperties = {
  fontSize: 16,
  fontWeight: 700,
  marginTop: 8,
  textAlign: 'right',
};

const sectionStyle: CSSProperties = {
  border: '1px solid #d1d5db',
  marginBottom: 18,
};

const sectionHeaderStyle: CSSProperties = {
  alignItems: 'center',
  background: '#f3f4f6',
  borderBottom: '1px solid #d1d5db',
  display: 'grid',
  gap: 12,
  gridTemplateColumns: '1fr 150px 150px 150px',
  padding: '10px 12px',
};

const sectionAmountStyle: CSSProperties = {
  fontSize: 13,
  textAlign: 'right',
};

const tableStyle: CSSProperties = {
  borderCollapse: 'collapse',
  tableLayout: 'fixed',
  width: '100%',
};

const thStyle: CSSProperties = {
  background: '#f9fafb',
  border: '1px solid #d1d5db',
  fontSize: 13,
  padding: '8px 10px',
  textAlign: 'left',
};

const tdStyle: CSSProperties = {
  border: '1px solid #d1d5db',
  fontSize: 13,
  overflowWrap: 'break-word',
  padding: '8px 10px',
  verticalAlign: 'top',
};

const numberCellStyle: CSSProperties = {
  ...tdStyle,
  textAlign: 'right',
  whiteSpace: 'nowrap',
};

const totalRowStyle: CSSProperties = {
  background: '#f9fafb',
  fontWeight: 700,
};

const footerGridStyle: CSSProperties = {
  border: '1px solid #111827',
  display: 'grid',
  gridTemplateColumns: '1fr 220px',
  marginTop: 4,
};

const footerCellStyle: CSSProperties = {
  borderBottom: '1px solid #d1d5db',
  fontSize: 14,
  fontWeight: 700,
  padding: '10px 12px',
};

const money = (value: number) => `Rp ${formatCurrency(value || 0)}`;

const getAmountStyle = (value: number, strong = true): CSSProperties => ({
  color: value < 0 ? '#dc2626' : '#111827',
  fontWeight: strong ? 700 : 500,
});

const cashInText = (value: number) => value > 0 ? money(value) : '-';

const cashOutText = (value: number) => value < 0 ? money(Math.abs(value)) : '-';

const CooperativeCashFlowStatementReport = forwardRef<HTMLDivElement, CooperativeCashFlowStatementReportProps>(
  function CooperativeCashFlowStatementReport({
    statement,
    companyName,
    logoDataUrl,
    periodText,
    printDateText,
  }, ref) {
    const { t } = useI18n();
    const report = statement ?? emptyStatement;
    const summaryItems = [
      {
        key: 'beginning',
        label: t('cooperative.reports.cashFlow.beginningCash'),
        value: report.beginning_cash_amount,
      },
      {
        key: 'operating',
        label: t('cooperative.reports.cashFlow.operatingNet'),
        value: report.operating_net_amount,
        testId: 'koperasi-cash-flow-operating-net',
      },
      {
        key: 'investing',
        label: t('cooperative.reports.cashFlow.investingNet'),
        value: report.investing_net_amount,
      },
      {
        key: 'financing',
        label: t('cooperative.reports.cashFlow.financingNet'),
        value: report.financing_net_amount,
        testId: 'koperasi-cash-flow-financing-net',
      },
      {
        key: 'net-change',
        label: t('cooperative.reports.cashFlow.netChange'),
        value: report.net_cash_change_amount,
      },
      {
        key: 'ending',
        label: t('cooperative.reports.cashFlow.endingCash'),
        value: report.ending_cash_amount,
      },
    ];

    return (
      <div ref={ref} style={reportWrapperStyle} data-testid="koperasi-cash-flow-report">
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
                {t('cooperative.reports.title')}
              </div>
            </div>
          </div>
          <div style={reportMetaStyle}>
            <div>{t('cooperative.ledger.period')}: {periodText}</div>
            <div>{t('report.printDate')} {printDateText}</div>
          </div>
        </div>

        <div style={reportTitleStyle}>
          <div style={{ fontSize: 18, fontWeight: 700, textTransform: 'uppercase' }}>
            {t('cooperative.reports.cashFlow.reportTitle')}
          </div>
          <div style={{ color: '#4b5563', fontSize: 13, marginTop: 4 }}>
            {periodText}
          </div>
        </div>

        <div style={summaryGridStyle}>
          {summaryItems.map((item, index) => (
            <div
              key={item.key}
              style={{
                ...summaryCellStyle,
                borderBottom: index >= 3 ? 0 : summaryCellStyle.borderBottom,
                borderRight: (index + 1) % 3 === 0 ? 0 : summaryCellStyle.borderRight,
              }}
            >
              <div style={summaryLabelStyle}>{item.label}</div>
              <div style={summaryValueStyle}>
                <span data-testid={item.testId} style={getAmountStyle(item.value)}>
                  {money(item.value)}
                </span>
              </div>
            </div>
          ))}
        </div>

        {report.sections.map((section) => (
          <section key={section.activity} style={sectionStyle}>
            <div style={sectionHeaderStyle}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>
                  {t(cashFlowActivityLabelKey[section.activity])}
                </div>
              </div>
              <div style={sectionAmountStyle}>
                <div style={{ color: '#4b5563', fontSize: 12 }}>{t('cooperative.reports.cashFlow.cashIn')}</div>
                <div style={{ fontWeight: 700 }}>{money(section.cash_in_amount)}</div>
              </div>
              <div style={sectionAmountStyle}>
                <div style={{ color: '#4b5563', fontSize: 12 }}>{t('cooperative.reports.cashFlow.cashOut')}</div>
                <div style={{ fontWeight: 700 }}>{money(section.cash_out_amount)}</div>
              </div>
              <div style={sectionAmountStyle}>
                <div style={{ color: '#4b5563', fontSize: 12 }}>{t('cooperative.reports.cashFlow.net')}</div>
                <div style={getAmountStyle(section.net_amount)}>{money(section.net_amount)}</div>
              </div>
            </div>
            <table style={tableStyle}>
              <colgroup>
                <col style={{ width: 120 }} />
                <col style={{ width: 150 }} />
                <col style={{ width: 170 }} />
                <col />
                <col style={{ width: 140 }} />
                <col style={{ width: 140 }} />
                <col style={{ width: 140 }} />
              </colgroup>
              <thead>
                <tr>
                  <th style={thStyle}>{t('cooperative.reports.table.date')}</th>
                  <th style={thStyle}>{t('generalLedger.journal.number')}</th>
                  <th style={thStyle}>{t('generalLedger.journal.source')}</th>
                  <th style={thStyle}>{t('cooperative.reports.table.description')}</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>{t('cooperative.reports.cashFlow.cashIn')}</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>{t('cooperative.reports.cashFlow.cashOut')}</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>{t('cooperative.reports.cashFlow.net')}</th>
                </tr>
              </thead>
              <tbody>
                {section.rows.length === 0 ? (
                  <tr>
                    <td style={{ ...tdStyle, textAlign: 'center' }} colSpan={7}>
                      {t('cooperative.reports.cashFlow.empty')}
                    </td>
                  </tr>
                ) : (
                  section.rows.map((row) => (
                    <tr key={row.id}>
                      <td style={tdStyle}>{formatDate(row.entry_date)}</td>
                      <td style={tdStyle}>{row.entry_number}</td>
                      <td style={tdStyle}>
                        <div>{row.source_number || '-'}</div>
                        <div style={{ color: '#6b7280', fontSize: 12 }}>{row.source_type}</div>
                      </td>
                      <td style={tdStyle}>{row.description || '-'}</td>
                      <td style={numberCellStyle}>{cashInText(row.amount)}</td>
                      <td style={numberCellStyle}>{cashOutText(row.amount)}</td>
                      <td style={numberCellStyle}>
                        <span style={getAmountStyle(row.amount, false)}>{money(row.amount)}</span>
                      </td>
                    </tr>
                  ))
                )}
                <tr style={totalRowStyle}>
                  <td style={tdStyle} colSpan={4}>
                    {t('common.total')} {t(cashFlowActivityLabelKey[section.activity])}
                  </td>
                  <td style={numberCellStyle}>{money(section.cash_in_amount)}</td>
                  <td style={numberCellStyle}>{money(section.cash_out_amount)}</td>
                  <td style={numberCellStyle}>
                    <span style={getAmountStyle(section.net_amount)}>{money(section.net_amount)}</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </section>
        ))}

        <div style={footerGridStyle}>
          <div style={footerCellStyle}>{t('cooperative.reports.cashFlow.netChange')}</div>
          <div style={{ ...footerCellStyle, textAlign: 'right' }}>
            <span style={getAmountStyle(report.net_cash_change_amount)}>
              {money(report.net_cash_change_amount)}
            </span>
          </div>
          <div style={{ ...footerCellStyle, borderBottom: 0 }}>{t('cooperative.reports.cashFlow.endingCash')}</div>
          <div style={{ ...footerCellStyle, borderBottom: 0, textAlign: 'right' }}>
            {money(report.ending_cash_amount)}
          </div>
        </div>
      </div>
    );
  },
);

export default CooperativeCashFlowStatementReport;
