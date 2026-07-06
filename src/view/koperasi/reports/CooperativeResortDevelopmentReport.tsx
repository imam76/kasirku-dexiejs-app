import { forwardRef, type CSSProperties } from 'react';
import { Building2 } from 'lucide-react';
import { useI18n } from '@/hooks/useI18n';
import dayjs from '@/lib/dayjs';
import type {
  CooperativeResortDevelopmentPreviousMonthComparison,
  CooperativeResortDevelopmentReport as CooperativeResortDevelopmentReportData,
  CooperativeResortDevelopmentReportGroup,
  CooperativeResortDevelopmentReportRow,
  CooperativeResortDevelopmentReportSummary,
} from '@/services/cooperativeResortDevelopmentReportService';
import { formatCurrency } from '@/utils/formatters';

type CooperativeResortDevelopmentReportProps = {
  data?: CooperativeResortDevelopmentReportData;
  companyName: string;
  logoDataUrl?: string;
  villageDistrictText: string;
  regencyText: string;
  monthText: string;
  employeeText: string;
  printDateText: string;
};

const REPORT_MIN_WIDTH = 1380;

const emptySummary: CooperativeResortDevelopmentReportSummary = {
  row_count: 0,
  active_member_count: 0,
  opening_balance_amount: 0,
  drop_amount: 0,
  service_amount: 0,
  new_loan_amount: 0,
  total_loan_amount: 0,
  installment_amount: 0,
  ending_balance_amount: 0,
  collection_ratio: 0,
  monthly_installment_target_amount: 0,
  target_difference_amount: 0,
  overdue_installment_count: 0,
};

const wrapperStyle: CSSProperties = {
  background: '#ffffff',
  border: '1px solid #d1d5db',
  color: '#111827',
  fontFamily: 'Arial, sans-serif',
  minWidth: REPORT_MIN_WIDTH,
  padding: 24,
};

const headerStyle: CSSProperties = {
  borderBottom: '2px solid #111827',
  display: 'grid',
  gap: 16,
  gridTemplateColumns: 'minmax(360px, 1.2fr) minmax(360px, 1fr)',
  marginBottom: 16,
  paddingBottom: 12,
};

const logoStyle: CSSProperties = {
  alignItems: 'center',
  border: '1px solid #d1d5db',
  display: 'flex',
  flexShrink: 0,
  height: 56,
  justifyContent: 'center',
  overflow: 'hidden',
  width: 56,
};

const identityRowStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '130px 1fr',
  lineHeight: 1.5,
};

const groupStyle: CSSProperties = {
  border: '1px solid #9ca3af',
  breakInside: 'avoid',
  marginBottom: 18,
};

const groupHeaderStyle: CSSProperties = {
  background: '#f3f4f6',
  borderBottom: '1px solid #9ca3af',
  display: 'grid',
  gap: 12,
  gridTemplateColumns: 'minmax(320px, 1fr) minmax(420px, 1.2fr)',
  padding: '9px 12px',
};

const tableStyle: CSSProperties = {
  borderCollapse: 'collapse',
  tableLayout: 'fixed',
  width: '100%',
};

const thStyle: CSSProperties = {
  background: '#f3f4f6',
  border: '1px solid #9ca3af',
  color: '#111827',
  fontSize: 11,
  fontWeight: 700,
  lineHeight: 1.25,
  padding: '5px 4px',
  textAlign: 'center',
  verticalAlign: 'middle',
};

const tdStyle: CSSProperties = {
  border: '1px solid #d1d5db',
  fontSize: 11,
  lineHeight: 1.3,
  padding: '5px 4px',
  verticalAlign: 'middle',
};

const numberCellStyle: CSSProperties = {
  ...tdStyle,
  textAlign: 'right',
  whiteSpace: 'nowrap',
};

const subtotalStyle: CSSProperties = {
  background: '#f9fafb',
  fontWeight: 700,
};

const totalStyle: CSSProperties = {
  background: '#e5e7eb',
  fontWeight: 700,
};

const summaryTableStyle: CSSProperties = {
  ...tableStyle,
  marginTop: 12,
};

const money = (value: number) => `Rp ${formatCurrency(value || 0)}`;
const moneyOrDash = (value: number) => Math.abs(value || 0) > 0.01 ? money(value) : '-';
const percent = (value: number) => `${(value || 0).toFixed(2)}%`;
const numberOrDash = (value: number) => value ? String(value) : '-';

const employeeToken = (employeeId?: string) => employeeId ?? 'UNASSIGNED';

const getEmployeeLabel = (
  value: Pick<CooperativeResortDevelopmentReportGroup, 'employee_name' | 'employee_position'>,
  unassignedLabel: string,
) => {
  if (!value.employee_name) return unassignedLabel;
  return value.employee_position
    ? `${value.employee_name} - ${value.employee_position}`
    : value.employee_name;
};

const renderHeader = (labels: {
  day: string;
  openingBalance: string;
  drop: string;
  service: string;
  newLoan: string;
  totalLoan: string;
  installment: string;
  endingBalance: string;
  activeMembers: string;
  collectionRatio: string;
  monthlyTarget: string;
  targetDifference: string;
  overdue: string;
}) => (
  <thead>
    <tr>
      <th style={thStyle}>{labels.day}</th>
      <th style={thStyle}>{labels.openingBalance}</th>
      <th style={thStyle}>{labels.drop}</th>
      <th style={thStyle}>{labels.service}</th>
      <th style={thStyle}>{labels.newLoan}</th>
      <th style={thStyle}>{labels.totalLoan}</th>
      <th style={thStyle}>{labels.installment}</th>
      <th style={thStyle}>{labels.endingBalance}</th>
      <th style={thStyle}>{labels.activeMembers}</th>
      <th style={thStyle}>{labels.collectionRatio}</th>
      <th style={thStyle}>{labels.monthlyTarget}</th>
      <th style={thStyle}>{labels.targetDifference}</th>
      <th style={thStyle}>{labels.overdue}</th>
    </tr>
  </thead>
);

const renderRow = (row: CooperativeResortDevelopmentReportRow) => (
  <tr
    key={row.id}
    data-testid={`koperasi-resort-development-row-${employeeToken(row.employee_id)}-${row.date_key}`}
  >
    <td style={{ ...tdStyle, textAlign: 'center' }}>
      <div style={{ fontWeight: 700 }}>{dayjs(row.date_key).tz().format('dddd').toUpperCase()}</div>
      <div>{dayjs(row.date_key).tz().format('DD.MM.YYYY')}</div>
    </td>
    <td style={numberCellStyle}>{money(row.opening_balance_amount)}</td>
    <td style={numberCellStyle}>{moneyOrDash(row.drop_amount)}</td>
    <td style={numberCellStyle}>{moneyOrDash(row.service_amount)}</td>
    <td style={numberCellStyle}>{moneyOrDash(row.new_loan_amount)}</td>
    <td style={numberCellStyle}>{money(row.total_loan_amount)}</td>
    <td style={numberCellStyle}>{moneyOrDash(row.installment_amount)}</td>
    <td style={numberCellStyle}>{money(row.ending_balance_amount)}</td>
    <td style={{ ...tdStyle, textAlign: 'center' }}>-</td>
    <td style={{ ...tdStyle, textAlign: 'center' }}>-</td>
    <td style={numberCellStyle}>-</td>
    <td style={numberCellStyle}>-</td>
    <td style={{ ...tdStyle, textAlign: 'center' }}>-</td>
  </tr>
);

const renderSummaryCells = (summary: CooperativeResortDevelopmentReportSummary) => (
  <>
    <td style={numberCellStyle}>{money(summary.opening_balance_amount)}</td>
    <td style={numberCellStyle}>{moneyOrDash(summary.drop_amount)}</td>
    <td style={numberCellStyle}>{moneyOrDash(summary.service_amount)}</td>
    <td style={numberCellStyle}>{moneyOrDash(summary.new_loan_amount)}</td>
    <td style={numberCellStyle}>{money(summary.total_loan_amount)}</td>
    <td style={numberCellStyle}>{moneyOrDash(summary.installment_amount)}</td>
    <td style={numberCellStyle}>{money(summary.ending_balance_amount)}</td>
    <td style={{ ...tdStyle, textAlign: 'center' }}>{numberOrDash(summary.active_member_count)}</td>
    <td style={{ ...tdStyle, textAlign: 'center' }}>{percent(summary.collection_ratio)}</td>
    <td style={numberCellStyle}>{moneyOrDash(summary.monthly_installment_target_amount)}</td>
    <td style={numberCellStyle}>{money(summary.target_difference_amount)}</td>
    <td style={{ ...tdStyle, textAlign: 'center' }}>{numberOrDash(summary.overdue_installment_count)}</td>
  </>
);

const renderIdentityRow = (label: string, value: string) => (
  <div style={identityRowStyle}>
    <strong>{label.replace(/:$/, '')}</strong>
    <span>: {value || '-'}</span>
  </div>
);

const renderComparisonRows = (
  comparison: CooperativeResortDevelopmentPreviousMonthComparison,
  labels: {
    metric: string;
    currentMonth: string;
    previousMonth: string;
    difference: string;
    drop: string;
    installment: string;
    collectionRatio: string;
  },
) => (
  <table style={summaryTableStyle}>
    <thead>
      <tr>
        <th style={thStyle}>{labels.metric}</th>
        <th style={thStyle}>{labels.currentMonth}</th>
        <th style={thStyle}>{labels.previousMonth}</th>
        <th style={thStyle}>{labels.difference}</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td style={tdStyle}>{labels.drop}</td>
        <td style={numberCellStyle}>{moneyOrDash(comparison.drop_amount.current_amount)}</td>
        <td style={numberCellStyle}>{moneyOrDash(comparison.drop_amount.previous_amount)}</td>
        <td style={numberCellStyle}>{money(comparison.drop_amount.difference_amount)}</td>
      </tr>
      <tr>
        <td style={tdStyle}>{labels.installment}</td>
        <td style={numberCellStyle}>{moneyOrDash(comparison.installment_amount.current_amount)}</td>
        <td style={numberCellStyle}>{moneyOrDash(comparison.installment_amount.previous_amount)}</td>
        <td style={numberCellStyle}>{money(comparison.installment_amount.difference_amount)}</td>
      </tr>
      <tr>
        <td style={tdStyle}>{labels.collectionRatio}</td>
        <td style={{ ...tdStyle, textAlign: 'right' }}>{percent(comparison.collection_ratio.current_percentage)}</td>
        <td style={{ ...tdStyle, textAlign: 'right' }}>{percent(comparison.collection_ratio.previous_percentage)}</td>
        <td style={{ ...tdStyle, textAlign: 'right' }}>{percent(comparison.collection_ratio.difference_percentage)}</td>
      </tr>
    </tbody>
  </table>
);

const CooperativeResortDevelopmentReport = forwardRef<HTMLDivElement, CooperativeResortDevelopmentReportProps>(
  function CooperativeResortDevelopmentReport({
    data,
    companyName,
    logoDataUrl,
    villageDistrictText,
    regencyText,
    monthText,
    employeeText,
    printDateText,
  }, ref) {
    const { t } = useI18n();
    const groups = data?.groups ?? [];
    const summary = data?.summary ?? emptySummary;
    const labels = {
      day: t('cooperative.resortDevelopment.day'),
      openingBalance: t('cooperative.resortDevelopment.openingBalance'),
      drop: t('cooperative.resortDevelopment.drop'),
      service: t('cooperative.resortDevelopment.service'),
      newLoan: t('cooperative.resortDevelopment.newLoan'),
      totalLoan: t('cooperative.resortDevelopment.totalLoan'),
      installment: t('cooperative.resortDevelopment.installment'),
      endingBalance: t('cooperative.resortDevelopment.endingBalance'),
      activeMembers: t('cooperative.resortDevelopment.activeMembersShort'),
      collectionRatio: t('cooperative.resortDevelopment.collectionRatioShort'),
      monthlyTarget: t('cooperative.resortDevelopment.monthlyTargetShort'),
      targetDifference: t('cooperative.resortDevelopment.targetDifferenceShort'),
      overdue: t('cooperative.resortDevelopment.overdueShort'),
    };
    const comparisonLabels = {
      metric: t('cooperative.resortDevelopment.metric'),
      currentMonth: t('cooperative.resortDevelopment.currentMonth'),
      previousMonth: `${t('cooperative.resortDevelopment.previousMonth')} ${data?.previous_month_comparison.month_key ?? ''}`,
      difference: t('cooperative.resortDevelopment.difference'),
      drop: t('cooperative.resortDevelopment.drop'),
      installment: t('cooperative.resortDevelopment.installment'),
      collectionRatio: t('cooperative.resortDevelopment.collectionRatio'),
    };

    return (
      <div ref={ref} style={wrapperStyle} data-testid="koperasi-resort-development-report">
        <div style={headerStyle}>
          <div style={{ alignItems: 'center', display: 'flex', gap: 12 }}>
            <div style={logoStyle}>
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
            <div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{companyName}</div>
              <div style={{ color: '#4b5563', fontSize: 12 }}>
                {t('cooperative.resortDevelopment.reportName')}
              </div>
            </div>
          </div>
          <div style={{ fontSize: 12 }}>
            {renderIdentityRow(t('cooperative.resortDevelopment.cooperativeName'), companyName)}
            {renderIdentityRow(t('cooperative.resortDevelopment.villageDistrict'), villageDistrictText)}
            {renderIdentityRow(t('cooperative.resortDevelopment.regency'), regencyText)}
            {renderIdentityRow(t('cooperative.resortDevelopment.month'), monthText)}
            {renderIdentityRow(t('cooperative.resortDevelopment.employee'), employeeText)}
            {renderIdentityRow(t('report.printDate'), printDateText)}
          </div>
        </div>

        <div style={{ marginBottom: 18, textAlign: 'center' }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>
            {t('cooperative.resortDevelopment.title')}
          </div>
          <div style={{ color: '#4b5563', fontSize: 12, marginTop: 4 }}>
            {t('cooperative.resortDevelopment.subtitle')}
          </div>
        </div>

        {groups.length === 0 ? (
          <div style={{ border: '1px solid #d1d5db', padding: 24, textAlign: 'center' }}>
            {t('cooperative.resortDevelopment.empty')}
          </div>
        ) : groups.map((group) => {
          const token = employeeToken(group.employee_id);
          return (
            <section
              key={group.key}
              style={groupStyle}
              data-testid={`koperasi-resort-development-group-${token}`}
            >
              <div style={groupHeaderStyle}>
                <div>
                  <div style={{ color: '#4b5563', fontSize: 12, fontWeight: 700 }}>
                    {t('cooperative.resortDevelopment.resortEmployee')}
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, marginTop: 2 }}>
                    {getEmployeeLabel(group, t('cooperative.memberRegister.unassignedEmployee'))}
                  </div>
                </div>
                <div>
                  <div style={{ color: '#4b5563', fontSize: 12, fontWeight: 700 }}>
                    {t('cooperative.resortDevelopment.workArea')}
                  </div>
                  <div style={{ fontSize: 12, marginTop: 2 }}>
                    {group.area_names.join(', ') || '-'}
                  </div>
                </div>
              </div>

              <table style={tableStyle}>
                <colgroup>
                  <col style={{ width: 92 }} />
                  {Array.from({ length: 7 }, (_, index) => (
                    <col key={`money-${index}`} style={{ width: 118 }} />
                  ))}
                  <col style={{ width: 72 }} />
                  <col style={{ width: 74 }} />
                  <col style={{ width: 114 }} />
                  <col style={{ width: 114 }} />
                  <col style={{ width: 72 }} />
                </colgroup>
                {renderHeader(labels)}
                <tbody>
                  {group.rows.map(renderRow)}
                  <tr style={subtotalStyle} data-testid={`koperasi-resort-development-total-${token}`}>
                    <td style={tdStyle}>{t('cooperative.resortDevelopment.subtotal')}</td>
                    {renderSummaryCells(group.summary)}
                  </tr>
                </tbody>
              </table>
            </section>
          );
        })}

        {groups.length > 0 ? (
          <table style={{ ...tableStyle, marginTop: 12 }}>
            {renderHeader(labels)}
            <tbody>
              <tr style={totalStyle} data-testid="koperasi-resort-development-grand-total">
                <td style={tdStyle}>{t('cooperative.resortDevelopment.grandTotal')}</td>
                {renderSummaryCells(summary)}
              </tr>
            </tbody>
          </table>
        ) : null}

        {groups.length > 0 ? (
          <div style={{ breakInside: 'avoid', marginTop: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>
              {t('cooperative.resortDevelopment.bottomSummary')}
            </div>
            <table style={summaryTableStyle}>
              <tbody>
                <tr>
                  <td style={tdStyle}>{t('cooperative.resortDevelopment.totalServiceIncome')}</td>
                  <td style={numberCellStyle}>{moneyOrDash(summary.service_amount)}</td>
                </tr>
                <tr>
                  <td style={tdStyle}>{t('cooperative.resortDevelopment.receivableChange')}</td>
                  <td style={numberCellStyle}>{money(summary.ending_balance_amount - summary.opening_balance_amount)}</td>
                </tr>
              </tbody>
            </table>

            {data?.previous_month_comparison ? (
              <>
                <div style={{ fontSize: 13, fontWeight: 700, marginTop: 12 }}>
                  {t('cooperative.resortDevelopment.previousMonthComparison')}
                </div>
                {renderComparisonRows(data.previous_month_comparison, comparisonLabels)}
              </>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  },
);

export default CooperativeResortDevelopmentReport;
