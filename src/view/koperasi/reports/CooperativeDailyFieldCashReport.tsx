import { forwardRef, type CSSProperties } from 'react';
import { Building2 } from 'lucide-react';
import { useI18n } from '@/hooks/useI18n';
import dayjs from '@/lib/dayjs';
import type {
  CooperativeDailyFieldCashReport as CooperativeDailyFieldCashReportData,
  CooperativeDailyFieldCashReportGroup,
  CooperativeDailyFieldCashReportRow,
  CooperativeDailyFieldCashReportSummary,
} from '@/services/cooperativeDailyFieldCashReportService';
import { formatCurrency } from '@/utils/formatters';

type CooperativeDailyFieldCashReportProps = {
  data?: CooperativeDailyFieldCashReportData;
  companyName: string;
  logoDataUrl?: string;
  periodText: string;
  collectorText: string;
  printDateText: string;
};

const REPORT_MIN_WIDTH = 1200;

const emptySummary: CooperativeDailyFieldCashReportSummary = {
  row_count: 0,
  storting_loan_payment_amount: 0,
  storting_saving_deposit_amount: 0,
  loan_disbursement_amount: 0,
  saving_withdrawal_amount: 0,
  iptw_payout_amount: 0,
  dropping_from_finance_amount: 0,
  deposit_to_finance_amount: 0,
  net_cash_amount: 0,
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
  gridTemplateColumns: 'repeat(8, 1fr)',
  marginBottom: 18,
};

const summaryCellStyle: CSSProperties = {
  borderRight: '1px solid #d1d5db',
  minHeight: 66,
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

const groupStyle: CSSProperties = {
  border: '1px solid #d1d5db',
  marginBottom: 18,
};

const groupHeaderStyle: CSSProperties = {
  alignItems: 'start',
  background: '#f3f4f6',
  borderBottom: '1px solid #d1d5db',
  display: 'grid',
  gap: 12,
  gridTemplateColumns: '1fr 200px 200px',
  padding: '10px 12px',
};

const groupAmountStyle: CSSProperties = {
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
  color: '#111827',
  fontSize: 13,
  fontWeight: 700,
  padding: '8px 8px',
  textAlign: 'left',
};

const tdStyle: CSSProperties = {
  border: '1px solid #d1d5db',
  fontSize: 13,
  overflowWrap: 'break-word',
  padding: '7px 8px',
  verticalAlign: 'top',
};

const numberCellStyle: CSSProperties = {
  ...tdStyle,
  textAlign: 'right',
  whiteSpace: 'nowrap',
};

const subtotalRowStyle: CSSProperties = {
  background: '#f9fafb',
  fontWeight: 700,
};

const money = (value: number) => `Rp ${formatCurrency(value || 0)}`;

const moneyOrDash = (value: number) => Math.abs(value) > 0.01 ? money(value) : '-';

const formatDateDot = (value: string) => dayjs(value).tz().format('DD.MM.YYYY');

const formatDayName = (value: string) => dayjs(value).tz().format('dddd').toUpperCase();

const getCollectorLabel = (
  group: Pick<CooperativeDailyFieldCashReportGroup, 'employee_name' | 'employee_position'>,
  unassignedLabel: string,
) => {
  if (!group.employee_name) return unassignedLabel;
  return group.employee_position ? `${group.employee_name} - ${group.employee_position}` : group.employee_name;
};

const summaryItems = (
  summary: CooperativeDailyFieldCashReportSummary,
  labels: {
    stortingLoanPayment: string;
    stortingSavingDeposit: string;
    loanDisbursement: string;
    savingWithdrawal: string;
    iptwPayout: string;
    droppingFromFinance: string;
    depositToFinance: string;
    netCash: string;
  },
) => [
  { key: 'stortingLoanPayment', label: labels.stortingLoanPayment, value: money(summary.storting_loan_payment_amount) },
  { key: 'stortingSavingDeposit', label: labels.stortingSavingDeposit, value: money(summary.storting_saving_deposit_amount) },
  { key: 'loanDisbursement', label: labels.loanDisbursement, value: money(summary.loan_disbursement_amount) },
  { key: 'savingWithdrawal', label: labels.savingWithdrawal, value: money(summary.saving_withdrawal_amount) },
  { key: 'iptwPayout', label: labels.iptwPayout, value: money(summary.iptw_payout_amount) },
  { key: 'droppingFromFinance', label: labels.droppingFromFinance, value: money(summary.dropping_from_finance_amount) },
  { key: 'depositToFinance', label: labels.depositToFinance, value: money(summary.deposit_to_finance_amount) },
  { key: 'netCash', label: labels.netCash, value: money(summary.net_cash_amount) },
];

const renderAmountCells = (summary: Pick<
  CooperativeDailyFieldCashReportSummary,
  'storting_loan_payment_amount' | 'storting_saving_deposit_amount' | 'loan_disbursement_amount' | 'saving_withdrawal_amount' | 'iptw_payout_amount' | 'dropping_from_finance_amount' | 'deposit_to_finance_amount' | 'net_cash_amount'
>) => (
  <>
    <td style={numberCellStyle}>{moneyOrDash(summary.storting_loan_payment_amount)}</td>
    <td style={numberCellStyle}>{moneyOrDash(summary.storting_saving_deposit_amount)}</td>
    <td style={numberCellStyle}>{moneyOrDash(summary.loan_disbursement_amount)}</td>
    <td style={numberCellStyle}>{moneyOrDash(summary.saving_withdrawal_amount)}</td>
    <td style={numberCellStyle}>{moneyOrDash(summary.iptw_payout_amount)}</td>
    <td style={numberCellStyle}>{moneyOrDash(summary.dropping_from_finance_amount)}</td>
    <td style={numberCellStyle}>{moneyOrDash(summary.deposit_to_finance_amount)}</td>
    <td style={numberCellStyle}>{money(summary.net_cash_amount)}</td>
  </>
);

const renderRow = (row: CooperativeDailyFieldCashReportRow) => (
  <tr key={row.id}>
    <td style={tdStyle}>{formatDateDot(row.date_key)}</td>
    <td style={tdStyle}>{formatDayName(row.date_key)}</td>
    {renderAmountCells(row)}
  </tr>
);

const CooperativeDailyFieldCashReport = forwardRef<HTMLDivElement, CooperativeDailyFieldCashReportProps>(
  function CooperativeDailyFieldCashReport({
    data,
    companyName,
    logoDataUrl,
    periodText,
    collectorText,
    printDateText,
  }, ref) {
    const { t } = useI18n();
    const groups = data?.groups ?? [];
    const totalSummary = data?.summary ?? emptySummary;
    const labels = {
      title: t('cooperative.reports.dailyFieldCash.title'),
      subtitle: t('cooperative.reports.dailyFieldCash.subtitle'),
      period: t('cooperative.reports.dailyFieldCash.period'),
      collector: t('cooperative.reports.dailyFieldCash.collector'),
      areas: t('cooperative.reports.dailyStorting.areas'),
      date: t('cooperative.reports.table.date'),
      day: t('cooperative.reports.dailyStorting.day'),
      stortingLoanPayment: t('cooperative.reports.dailyFieldCash.stortingLoanPayment'),
      stortingSavingDeposit: t('cooperative.reports.dailyFieldCash.stortingSavingDeposit'),
      loanDisbursement: t('cooperative.reports.dailyFieldCash.loanDisbursement'),
      savingWithdrawal: t('cooperative.reports.dailyFieldCash.savingWithdrawal'),
      iptwPayout: t('cooperative.reports.dailyFieldCash.iptwPayout'),
      droppingFromFinance: t('cooperative.reports.dailyFieldCash.droppingFromFinance'),
      depositToFinance: t('cooperative.reports.dailyFieldCash.depositToFinance'),
      netCash: t('cooperative.reports.dailyFieldCash.netCash'),
      cashAccountBalance: t('cooperative.reports.dailyFieldCash.cashAccountBalance'),
    };

    return (
      <div ref={ref} style={reportWrapperStyle} data-testid="koperasi-daily-field-cash-report">
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
            <div>{labels.period}: {periodText}</div>
            <div>{labels.collector}: {collectorText}</div>
            <div>{t('report.printDate')} {printDateText}</div>
          </div>
        </div>

        <div style={reportTitleStyle}>
          <div style={{ fontSize: 18, fontWeight: 700, textTransform: 'uppercase' }}>
            {labels.title}
          </div>
          <div style={{ color: '#4b5563', fontSize: 13, marginTop: 4 }}>
            {labels.subtitle}
          </div>
        </div>

        <div style={summaryGridStyle}>
          {summaryItems(totalSummary, labels).map((item, index) => (
            <div
              key={item.key}
              style={{
                ...summaryCellStyle,
                borderRight: index === 7 ? 0 : summaryCellStyle.borderRight,
              }}
            >
              <div style={summaryLabelStyle}>{item.label}</div>
              <div style={summaryValueStyle}>{item.value}</div>
            </div>
          ))}
        </div>

        {groups.length === 0 ? (
          <table style={tableStyle}>
            <tbody>
              <tr>
                <td style={{ ...tdStyle, textAlign: 'center' }}>
                  {t('cooperative.reports.dailyFieldCash.empty')}
                </td>
              </tr>
            </tbody>
          </table>
        ) : (
          groups.map((group) => (
            <section key={group.key} style={groupStyle}>
              <div style={groupHeaderStyle}>
                <div>
                  <div style={{ color: '#4b5563', fontSize: 12, fontWeight: 700 }}>
                    {labels.collector}
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, marginTop: 2 }}>
                    {getCollectorLabel(group, t('cooperative.memberRegister.unassignedEmployee'))}
                  </div>
                  <div style={{ color: '#4b5563', fontSize: 12, marginTop: 4 }}>
                    {labels.areas}: {group.area_names.length > 0 ? group.area_names.join(', ') : '-'}
                  </div>
                </div>
                <div style={groupAmountStyle}>
                  <div style={{ color: '#4b5563', fontSize: 12 }}>{labels.stortingLoanPayment} + {labels.stortingSavingDeposit}</div>
                  <div style={{ fontWeight: 700 }}>{money(group.summary.storting_loan_payment_amount + group.summary.storting_saving_deposit_amount)}</div>
                </div>
                <div style={groupAmountStyle}>
                  <div style={{ color: '#4b5563', fontSize: 12 }}>{labels.cashAccountBalance}</div>
                  <div style={{ fontWeight: 700, color: group.cash_account_balance > 0 ? '#b91c1c' : 'inherit' }}>
                    {money(group.cash_account_balance)}
                  </div>
                </div>
              </div>

              <table style={tableStyle}>
                <colgroup>
                  <col style={{ width: 90 }} />
                  <col style={{ width: 90 }} />
                  <col style={{ width: 120 }} />
                  <col style={{ width: 120 }} />
                  <col style={{ width: 120 }} />
                  <col style={{ width: 120 }} />
                  <col style={{ width: 100 }} />
                  <col style={{ width: 120 }} />
                  <col style={{ width: 130 }} />
                  <col style={{ width: 130 }} />
                </colgroup>
                <thead>
                  <tr>
                    <th style={thStyle}>{labels.date}</th>
                    <th style={thStyle}>{labels.day}</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>{labels.stortingLoanPayment}</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>{labels.stortingSavingDeposit}</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>{labels.loanDisbursement}</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>{labels.savingWithdrawal}</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>{labels.iptwPayout}</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>{labels.droppingFromFinance}</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>{labels.depositToFinance}</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>{labels.netCash}</th>
                  </tr>
                </thead>
                <tbody>
                  {group.rows.map(renderRow)}
                  <tr style={subtotalRowStyle}>
                    <td style={tdStyle} colSpan={2}>{t('common.total')}</td>
                    {renderAmountCells(group.summary)}
                  </tr>
                </tbody>
              </table>
            </section>
          ))
        )}
      </div>
    );
  },
);

export default CooperativeDailyFieldCashReport;
