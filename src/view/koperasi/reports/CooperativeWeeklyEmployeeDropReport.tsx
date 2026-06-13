import { forwardRef, type CSSProperties } from 'react';
import { Building2 } from 'lucide-react';
import { useI18n } from '@/hooks/useI18n';
import type { I18nContextValue } from '@/i18n/I18nContext';
import dayjs from '@/lib/dayjs';
import {
  createEmptyCooperativeDailyDropReportSummary,
  type CooperativeDailyDropReportRow,
  type CooperativeDailyDropReportSummary,
} from '@/services/cooperativeDailyDropReportService';
import type {
  CooperativeWeeklyEmployeeDropReport as CooperativeWeeklyEmployeeDropReportData,
  CooperativeWeeklyEmployeeDropReportGroup,
  CooperativeWeeklyEmployeeDropReportWeek,
} from '@/services/cooperativeWeeklyEmployeeDropReportService';
import { formatCurrency } from '@/utils/formatters';

type CooperativeWeeklyEmployeeDropReportProps = {
  data?: CooperativeWeeklyEmployeeDropReportData;
  companyName: string;
  logoDataUrl?: string;
  periodText: string;
  printDateText: string;
};

const REPORT_MIN_WIDTH = 1360;

const emptySummary = createEmptyCooperativeDailyDropReportSummary();

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
  fontSize: 12,
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
  gridTemplateColumns: 'repeat(5, 1fr)',
  marginBottom: 18,
};

const summaryCellStyle: CSSProperties = {
  borderBottom: '1px solid #d1d5db',
  borderRight: '1px solid #d1d5db',
  minHeight: 70,
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

const weekStyle: CSSProperties = {
  border: '1px solid #d1d5db',
  marginBottom: 18,
};

const weekHeaderStyle: CSSProperties = {
  alignItems: 'center',
  background: '#e5e7eb',
  borderBottom: '1px solid #d1d5db',
  display: 'grid',
  gap: 12,
  gridTemplateColumns: '1fr 150px 150px 150px 170px',
  padding: '10px 12px',
};

const employeeHeaderStyle: CSSProperties = {
  alignItems: 'center',
  background: '#f3f4f6',
  borderBottom: '1px solid #d1d5db',
  display: 'grid',
  gap: 12,
  gridTemplateColumns: '1fr 170px 170px 170px',
  padding: '10px 12px',
};

const groupAmountStyle: CSSProperties = {
  fontSize: 12,
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
  fontSize: 11,
  padding: '8px 8px',
  textAlign: 'left',
};

const tdStyle: CSSProperties = {
  border: '1px solid #d1d5db',
  fontSize: 11,
  overflowWrap: 'break-word',
  padding: '8px 8px',
  verticalAlign: 'top',
};

const centerCellStyle: CSSProperties = {
  ...tdStyle,
  textAlign: 'center',
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

const money = (value: number) => `Rp ${formatCurrency(value || 0)}`;

const moneyOrDash = (value: number) => value > 0 ? money(value) : '-';

const countOrDash = (value: number) => value > 0 ? value : '-';

const formatDateDot = (value: string) => dayjs(value).tz().format('DD.MM.YYYY');

const formatDayName = (value: string) => dayjs(value).tz().format('dddd');

const formatWeekRange = (
  week: Pick<CooperativeWeeklyEmployeeDropReportWeek, 'start_date_key' | 'end_date_key'>,
) => {
  const startDate = formatDateDot(week.start_date_key);
  const endDate = formatDateDot(week.end_date_key);

  return startDate === endDate ? startDate : `${startDate} - ${endDate}`;
};

const getOfficerLabel = (
  group: Pick<CooperativeWeeklyEmployeeDropReportGroup, 'officer_name' | 'officer_position'>,
  unassignedLabel: string,
) => {
  if (!group.officer_name) return unassignedLabel;

  return group.officer_position
    ? `${group.officer_name} - ${group.officer_position}`
    : group.officer_name;
};

const summaryItems = (
  summary: CooperativeDailyDropReportSummary,
  labels: {
    oldMember: string;
    newMember: string;
    exitMember: string;
    principal: string;
    net: string;
    service: string;
    admin: string;
    tab: string;
    total: string;
    rowCount: string;
  },
) => [
  { key: 'rows', label: labels.rowCount, value: summary.row_count },
  { key: 'old', label: labels.oldMember, value: summary.old_member_count },
  { key: 'new', label: labels.newMember, value: summary.new_member_count },
  { key: 'exit', label: labels.exitMember, value: summary.exit_member_count },
  { key: 'principal', label: labels.principal, value: money(summary.principal_amount) },
  { key: 'net', label: labels.net, value: money(summary.net_disbursement_amount) },
  { key: 'service', label: labels.service, value: money(summary.loan_service_amount) },
  { key: 'admin', label: labels.admin, value: money(summary.admin_fee_amount) },
  { key: 'tab', label: labels.tab, value: money(summary.mandatory_saving_amount) },
  { key: 'total', label: labels.total, value: money(summary.total_payable_amount) },
];

const renderRow = (row: CooperativeDailyDropReportRow) => (
  <tr key={row.id}>
    <td style={tdStyle}>{formatDateDot(row.event_date)}</td>
    <td style={tdStyle}>{formatDayName(row.event_date)}</td>
    <td style={centerCellStyle}>{countOrDash(row.old_member_count)}</td>
    <td style={centerCellStyle}>{countOrDash(row.new_member_count)}</td>
    <td style={centerCellStyle}>{countOrDash(row.exit_member_count)}</td>
    <td style={tdStyle}>
      <div style={{ fontWeight: 700 }}>{row.member_number}</div>
      <div style={{ color: '#4b5563', marginTop: 2 }}>{row.member_name}</div>
    </td>
    <td style={numberCellStyle}>{moneyOrDash(row.principal_amount)}</td>
    <td style={numberCellStyle}>{moneyOrDash(row.net_disbursement_amount)}</td>
    <td style={numberCellStyle}>{moneyOrDash(row.loan_service_amount)}</td>
    <td style={numberCellStyle}>{moneyOrDash(row.admin_fee_amount)}</td>
    <td style={numberCellStyle}>{moneyOrDash(row.mandatory_saving_amount)}</td>
    <td style={numberCellStyle}>{moneyOrDash(row.total_payable_amount)}</td>
  </tr>
);

const renderGroupTable = (
  group: CooperativeWeeklyEmployeeDropReportGroup,
  labels: ReturnType<typeof getLabels>,
) => (
  <table style={tableStyle}>
    <colgroup>
      <col style={{ width: 92 }} />
      <col style={{ width: 88 }} />
      <col style={{ width: 42 }} />
      <col style={{ width: 42 }} />
      <col style={{ width: 42 }} />
      <col style={{ width: 170 }} />
      <col style={{ width: 130 }} />
      <col style={{ width: 150 }} />
      <col style={{ width: 150 }} />
      <col style={{ width: 120 }} />
      <col style={{ width: 120 }} />
      <col style={{ width: 150 }} />
    </colgroup>
    <thead>
      <tr>
        <th style={thStyle}>{labels.date}</th>
        <th style={thStyle}>{labels.day}</th>
        <th style={{ ...thStyle, textAlign: 'center' }}>L</th>
        <th style={{ ...thStyle, textAlign: 'center' }}>B</th>
        <th style={{ ...thStyle, textAlign: 'center' }}>K</th>
        <th style={thStyle}>{labels.memberCode}</th>
        <th style={{ ...thStyle, textAlign: 'right' }}>{labels.principal}</th>
        <th style={{ ...thStyle, textAlign: 'right' }}>{labels.net}</th>
        <th style={{ ...thStyle, textAlign: 'right' }}>{labels.service}</th>
        <th style={{ ...thStyle, textAlign: 'right' }}>{labels.admin}</th>
        <th style={{ ...thStyle, textAlign: 'right' }}>{labels.tab}</th>
        <th style={{ ...thStyle, textAlign: 'right' }}>{labels.total}</th>
      </tr>
    </thead>
    <tbody>
      {group.rows.map(renderRow)}
      <tr style={totalRowStyle}>
        <td style={tdStyle} colSpan={2}>{labels.totalLabel}</td>
        <td style={centerCellStyle}>{group.summary.old_member_count}</td>
        <td style={centerCellStyle}>{group.summary.new_member_count}</td>
        <td style={centerCellStyle}>{group.summary.exit_member_count}</td>
        <td style={tdStyle}>{group.summary.row_count}</td>
        <td style={numberCellStyle}>{money(group.summary.principal_amount)}</td>
        <td style={numberCellStyle}>{money(group.summary.net_disbursement_amount)}</td>
        <td style={numberCellStyle}>{money(group.summary.loan_service_amount)}</td>
        <td style={numberCellStyle}>{money(group.summary.admin_fee_amount)}</td>
        <td style={numberCellStyle}>{money(group.summary.mandatory_saving_amount)}</td>
        <td style={numberCellStyle}>{money(group.summary.total_payable_amount)}</td>
      </tr>
    </tbody>
  </table>
);

const getLabels = (t: I18nContextValue['t']) => ({
  oldMember: t('cooperative.reports.dailyDrop.oldMember'),
  newMember: t('cooperative.reports.dailyDrop.newMember'),
  exitMember: t('cooperative.reports.dailyDrop.exitMember'),
  principal: t('cooperative.reports.dailyDrop.principalDrop'),
  net: t('cooperative.reports.dailyDrop.netDrop'),
  service: t('cooperative.reports.dailyDrop.serviceDrop'),
  admin: t('cooperative.reports.dailyDrop.adminFee'),
  tab: t('cooperative.reports.dailyDrop.mandatorySaving'),
  total: t('cooperative.reports.dailyDrop.totalDrop'),
  rowCount: t('cooperative.reports.dailyDrop.rowCount'),
  date: t('cooperative.reports.table.date'),
  day: t('cooperative.reports.dailyDrop.day'),
  memberCode: t('cooperative.reports.dailyDrop.memberCode'),
  totalLabel: t('common.total'),
});

const CooperativeWeeklyEmployeeDropReport = forwardRef<HTMLDivElement, CooperativeWeeklyEmployeeDropReportProps>(
  function CooperativeWeeklyEmployeeDropReport({
    data,
    companyName,
    logoDataUrl,
    periodText,
    printDateText,
  }, ref) {
    const { t } = useI18n();
    const weeks = data?.weeks ?? [];
    const totalSummary = data?.summary ?? emptySummary;
    const labels = getLabels(t);

    return (
      <div ref={ref} style={reportWrapperStyle} data-testid="koperasi-weekly-employee-drop-report">
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
            {t('cooperative.reports.weeklyEmployeeDrop.title')}
          </div>
          <div style={{ color: '#4b5563', fontSize: 12, marginTop: 4 }}>
            {t('cooperative.reports.weeklyEmployeeDrop.subtitle')}
          </div>
        </div>

        <div style={summaryGridStyle}>
          {summaryItems(totalSummary, labels).map((item, index) => (
            <div
              key={item.key}
              style={{
                ...summaryCellStyle,
                borderBottom: index >= 5 ? 0 : summaryCellStyle.borderBottom,
                borderRight: (index + 1) % 5 === 0 ? 0 : summaryCellStyle.borderRight,
              }}
            >
              <div style={summaryLabelStyle}>{item.label}</div>
              <div style={summaryValueStyle}>{item.value}</div>
            </div>
          ))}
        </div>

        {weeks.length === 0 ? (
          <table style={tableStyle}>
            <tbody>
              <tr>
                <td style={{ ...tdStyle, textAlign: 'center' }}>
                  {t('cooperative.reports.weeklyEmployeeDrop.empty')}
                </td>
              </tr>
            </tbody>
          </table>
        ) : (
          weeks.map((week) => (
            <section key={week.key} style={weekStyle}>
              <div style={weekHeaderStyle}>
                <div>
                  <div style={{ color: '#4b5563', fontSize: 11, fontWeight: 700 }}>
                    {t('cooperative.reports.weeklyEmployeeDrop.week')} {week.week_index}
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, marginTop: 2 }}>
                    {formatWeekRange(week)}
                  </div>
                </div>
                <div style={groupAmountStyle}>
                  <div style={{ color: '#4b5563', fontSize: 11 }}>{labels.oldMember}</div>
                  <div style={{ fontWeight: 700 }}>{week.summary.old_member_count}</div>
                </div>
                <div style={groupAmountStyle}>
                  <div style={{ color: '#4b5563', fontSize: 11 }}>{labels.newMember}</div>
                  <div style={{ fontWeight: 700 }}>{week.summary.new_member_count}</div>
                </div>
                <div style={groupAmountStyle}>
                  <div style={{ color: '#4b5563', fontSize: 11 }}>{labels.exitMember}</div>
                  <div style={{ fontWeight: 700 }}>{week.summary.exit_member_count}</div>
                </div>
                <div style={groupAmountStyle}>
                  <div style={{ color: '#4b5563', fontSize: 11 }}>{labels.total}</div>
                  <div style={{ fontWeight: 700 }}>{money(week.summary.total_payable_amount)}</div>
                </div>
              </div>

              {week.groups.map((group) => (
                <section key={group.key}>
                  <div style={employeeHeaderStyle}>
                    <div>
                      <div style={{ color: '#4b5563', fontSize: 11, fontWeight: 700 }}>
                        {t('cooperative.reports.weeklyEmployeeDrop.employee')}
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 700, marginTop: 2 }}>
                        {getOfficerLabel(group, t('cooperative.memberRegister.unassignedEmployee'))}
                      </div>
                    </div>
                    <div style={groupAmountStyle}>
                      <div style={{ color: '#4b5563', fontSize: 11 }}>{labels.rowCount}</div>
                      <div style={{ fontWeight: 700 }}>{group.summary.row_count}</div>
                    </div>
                    <div style={groupAmountStyle}>
                      <div style={{ color: '#4b5563', fontSize: 11 }}>{labels.net}</div>
                      <div style={{ fontWeight: 700 }}>{money(group.summary.net_disbursement_amount)}</div>
                    </div>
                    <div style={groupAmountStyle}>
                      <div style={{ color: '#4b5563', fontSize: 11 }}>{labels.total}</div>
                      <div style={{ fontWeight: 700 }}>{money(group.summary.total_payable_amount)}</div>
                    </div>
                  </div>
                  {renderGroupTable(group, labels)}
                </section>
              ))}
            </section>
          ))
        )}
      </div>
    );
  },
);

export default CooperativeWeeklyEmployeeDropReport;
