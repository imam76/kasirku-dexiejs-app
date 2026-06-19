import { forwardRef, type CSSProperties, type ReactNode } from 'react';
import { Building2 } from 'lucide-react';
import { useI18n } from '@/hooks/useI18n';
import dayjs from '@/lib/dayjs';
import type {
  CooperativeDailyTargetReport as CooperativeDailyTargetReportData,
  CooperativeDailyTargetReportGroup,
  CooperativeDailyTargetReportRow,
  CooperativeDailyTargetReportSummary,
} from '@/services/cooperativeDailyTargetReportService';
import { getCollectionWeekdayLabel } from '@/utils/koperasi/collectionSchedule';
import { formatCurrency } from '@/utils/formatters';

type CooperativeDailyTargetReportProps = {
  data?: CooperativeDailyTargetReportData;
  companyName: string;
  logoDataUrl?: string;
  monthText: string;
  employeeText: string;
  printDateText: string;
};

type Labels = {
  day: string;
  members: string;
  oldMember: string;
  newMember: string;
  exitMember: string;
  total: string;
  target: string;
  openingTarget: string;
  installment: string;
  incomingInstallment: string;
  outgoingInstallment: string;
  endingTarget: string;
  realization: string;
  storting: string;
  percentage: string;
  drop: string;
  dropMargin: string;
  previousDrop: string;
  currentDrop: string;
  runningDrop: string;
  runningStorting: string;
  saving: string;
  savingWithdrawal: string;
  cash: string;
};

const REPORT_MIN_WIDTH = 1740;

const emptySummary: CooperativeDailyTargetReportSummary = {
  row_count: 0,
  old_member_count: 0,
  new_member_count: 0,
  exit_member_count: 0,
  ending_member_count: 0,
  opening_target_amount: 0,
  incoming_installment_amount: 0,
  outgoing_installment_amount: 0,
  ending_target_amount: 0,
  storting_amount: 0,
  achievement_percentage: 0,
  drop_margin_amount: 0,
  current_drop_amount: 0,
  running_drop_amount: 0,
  running_storting_amount: 0,
  saving_withdrawal_amount: 0,
  cash_amount: 0,
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
  display: 'flex',
  gap: 16,
  justifyContent: 'space-between',
  marginBottom: 16,
  paddingBottom: 12,
};

const logoStyle: CSSProperties = {
  alignItems: 'center',
  border: '1px solid #d1d5db',
  display: 'flex',
  flexShrink: 0,
  height: 54,
  justifyContent: 'center',
  overflow: 'hidden',
  width: 54,
};

const groupStyle: CSSProperties = {
  border: '1px solid #9ca3af',
  breakInside: 'avoid',
  marginBottom: 20,
};

const groupHeaderStyle: CSSProperties = {
  background: '#f3f4f6',
  borderBottom: '1px solid #9ca3af',
  display: 'grid',
  gap: 14,
  gridTemplateColumns: 'minmax(320px, 1fr) minmax(620px, 2fr)',
  padding: '10px 12px',
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
  padding: '5px 3px',
  textAlign: 'center',
  verticalAlign: 'middle',
};

const tdStyle: CSSProperties = {
  border: '1px solid #d1d5db',
  fontSize: 11,
  lineHeight: 1.3,
  padding: '5px 3px',
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

const money = (value: number) => `Rp ${formatCurrency(value || 0)}`;
const moneyOrDash = (value: number) => Math.abs(value) > 0.01 ? money(value) : '-';
const percent = (value: number) => `${Math.round(value || 0)}%`;
const employeeToken = (employeeId?: string) => employeeId ?? 'UNASSIGNED';

const getEmployeeLabel = (
  group: Pick<CooperativeDailyTargetReportGroup, 'employee_name' | 'employee_position'>,
  unassignedLabel: string,
) => {
  if (!group.employee_name) return unassignedLabel;
  return group.employee_position
    ? `${group.employee_name} - ${group.employee_position}`
    : group.employee_name;
};

const renderValueCells = (
  value: CooperativeDailyTargetReportRow | CooperativeDailyTargetReportSummary,
  showPreviousDrop = false,
) => (
  <>
    <td style={numberCellStyle}>{value.old_member_count}</td>
    <td style={numberCellStyle}>{value.new_member_count}</td>
    <td style={numberCellStyle}>{value.exit_member_count}</td>
    <td style={numberCellStyle}>{value.ending_member_count}</td>
    <td style={numberCellStyle}>{moneyOrDash(value.opening_target_amount)}</td>
    <td style={numberCellStyle}>{moneyOrDash(value.incoming_installment_amount)}</td>
    <td style={numberCellStyle}>{moneyOrDash(value.outgoing_installment_amount)}</td>
    <td style={numberCellStyle}>{moneyOrDash(value.ending_target_amount)}</td>
    <td style={numberCellStyle}>{moneyOrDash(value.storting_amount)}</td>
    <td style={numberCellStyle}>{percent(value.achievement_percentage)}</td>
    <td style={numberCellStyle}>{moneyOrDash(value.drop_margin_amount)}</td>
    <td style={numberCellStyle}>
      {showPreviousDrop && 'previous_drop_amount' in value
        ? moneyOrDash(value.previous_drop_amount)
        : '-'}
    </td>
    <td style={numberCellStyle}>{moneyOrDash(value.current_drop_amount)}</td>
    <td style={numberCellStyle}>{moneyOrDash(value.running_drop_amount)}</td>
    <td style={numberCellStyle}>{moneyOrDash(value.running_storting_amount)}</td>
    <td style={numberCellStyle}>{moneyOrDash(value.saving_withdrawal_amount)}</td>
    <td style={numberCellStyle}>{money(value.cash_amount)}</td>
  </>
);

const renderHeader = (labels: Labels) => (
  <thead>
    <tr>
      <th style={thStyle} rowSpan={2}>{labels.day}</th>
      <th style={thStyle} colSpan={4}>{labels.members}</th>
      <th style={thStyle}>{labels.target}</th>
      <th style={thStyle} colSpan={2}>{labels.installment}</th>
      <th style={thStyle}>{labels.target}</th>
      <th style={thStyle} colSpan={2}>{labels.realization}</th>
      <th style={thStyle} colSpan={4}>{labels.drop}</th>
      <th style={thStyle}>{labels.realization}</th>
      <th style={thStyle}>{labels.saving}</th>
      <th style={thStyle}>{labels.cash}</th>
    </tr>
    <tr>
      <th style={thStyle}>{labels.oldMember}</th>
      <th style={thStyle}>{labels.newMember}</th>
      <th style={thStyle}>{labels.exitMember}</th>
      <th style={thStyle}>{labels.total}</th>
      <th style={thStyle}>{labels.openingTarget}</th>
      <th style={thStyle}>{labels.incomingInstallment}</th>
      <th style={thStyle}>{labels.outgoingInstallment}</th>
      <th style={thStyle}>{labels.endingTarget}</th>
      <th style={thStyle}>{labels.storting}</th>
      <th style={thStyle}>{labels.percentage}</th>
      <th style={thStyle}>{labels.dropMargin}</th>
      <th style={thStyle}>{labels.previousDrop}</th>
      <th style={thStyle}>{labels.currentDrop}</th>
      <th style={thStyle}>{labels.runningDrop}</th>
      <th style={thStyle}>{labels.runningStorting}</th>
      <th style={thStyle}>{labels.savingWithdrawal}</th>
      <th style={thStyle}>{labels.cash}</th>
    </tr>
  </thead>
);

const renderRow = (row: CooperativeDailyTargetReportRow) => {
  const token = employeeToken(row.employee_id);
  return (
    <tr
      key={row.id}
      data-testid={`koperasi-daily-target-row-${token}-${row.date_key}-${row.collection_weekday}`}
    >
      <td style={{ ...tdStyle, textAlign: 'center' }}>
        <div style={{ fontWeight: 700 }}>
          {dayjs(row.date_key).tz().format('dddd').toUpperCase()}
        </div>
        <div>{dayjs(row.date_key).tz().format('DD.MM.YYYY')}</div>
      </td>
      {renderValueCells(row, true)}
    </tr>
  );
};

const renderWeekRows = (
  group: CooperativeDailyTargetReportGroup,
  totalLabel: string,
): ReactNode[] => group.weeks.flatMap((week) => [
  ...week.rows.map(renderRow),
  <tr
    key={`${group.key}:${week.key}:total`}
    style={subtotalStyle}
    data-testid={`koperasi-daily-target-week-total-${employeeToken(group.employee_id)}-${week.week_index}`}
  >
    <td style={tdStyle}>{totalLabel} {week.week_index}</td>
    {renderValueCells(week.summary)}
  </tr>,
]);

const CooperativeDailyTargetReport = forwardRef<HTMLDivElement, CooperativeDailyTargetReportProps>(
  function CooperativeDailyTargetReport({
    data,
    companyName,
    logoDataUrl,
    monthText,
    employeeText,
    printDateText,
  }, ref) {
    const { t } = useI18n();
    const groups = data?.groups ?? [];
    const summary = data?.summary ?? emptySummary;
    const labels: Labels = {
      day: t('cooperative.reports.dailyTarget.day'),
      members: t('cooperative.reports.dailyTarget.members'),
      oldMember: t('cooperative.reports.dailyTarget.oldMember'),
      newMember: t('cooperative.reports.dailyTarget.newMember'),
      exitMember: t('cooperative.reports.dailyTarget.exitMember'),
      total: t('cooperative.reports.dailyTarget.total'),
      target: t('cooperative.reports.dailyTarget.target'),
      openingTarget: t('cooperative.reports.dailyTarget.openingTarget'),
      installment: t('cooperative.reports.dailyTarget.installment'),
      incomingInstallment: t('cooperative.reports.dailyTarget.incomingInstallment'),
      outgoingInstallment: t('cooperative.reports.dailyTarget.outgoingInstallment'),
      endingTarget: t('cooperative.reports.dailyTarget.endingTarget'),
      realization: t('cooperative.reports.dailyTarget.realization'),
      storting: t('cooperative.reports.dailyTarget.storting'),
      percentage: t('cooperative.reports.dailyTarget.percentage'),
      drop: t('cooperative.reports.dailyTarget.drop'),
      dropMargin: t('cooperative.reports.dailyTarget.dropMargin'),
      previousDrop: t('cooperative.reports.dailyTarget.previousDrop'),
      currentDrop: t('cooperative.reports.dailyTarget.currentDrop'),
      runningDrop: t('cooperative.reports.dailyTarget.runningDrop'),
      runningStorting: t('cooperative.reports.dailyTarget.runningStorting'),
      saving: t('cooperative.reports.dailyTarget.saving'),
      savingWithdrawal: t('cooperative.reports.dailyTarget.savingWithdrawal'),
      cash: t('cooperative.reports.dailyTarget.cash'),
    };

    return (
      <div ref={ref} style={wrapperStyle} data-testid="koperasi-daily-target-report">
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
              <div style={{ color: '#4b5563', fontSize: 13 }}>{t('cooperative.reports.title')}</div>
            </div>
          </div>
          <div style={{ fontSize: 11, lineHeight: 1.55, textAlign: 'right' }}>
            <div>{t('cooperative.reports.dailyTarget.month')}: {monthText}</div>
            <div>{t('cooperative.reports.dailyTarget.employee')}: {employeeText}</div>
            <div>{t('report.printDate')} {printDateText}</div>
          </div>
        </div>

        <div style={{ marginBottom: 18, textAlign: 'center' }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>
            {t('cooperative.reports.dailyTarget.title')}
          </div>
          <div style={{ color: '#4b5563', fontSize: 11, marginTop: 4 }}>
            {t('cooperative.reports.dailyTarget.subtitle')}
          </div>
        </div>

        {groups.length === 0 ? (
          <div style={{ border: '1px solid #d1d5db', padding: 24, textAlign: 'center' }}>
            {t('cooperative.reports.dailyTarget.empty')}
          </div>
        ) : groups.map((group) => {
          const token = employeeToken(group.employee_id);
          return (
            <section
              key={group.key}
              style={groupStyle}
              data-testid={`koperasi-daily-target-group-${token}`}
            >
              <div style={groupHeaderStyle}>
                <div>
                  <div style={{ color: '#4b5563', fontSize: 10, fontWeight: 700 }}>
                    {t('cooperative.reports.dailyTarget.employee')}
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, marginTop: 2 }}>
                    {getEmployeeLabel(group, t('cooperative.memberRegister.unassignedEmployee'))}
                  </div>
                  <div style={{ color: '#4b5563', fontSize: 10, marginTop: 5 }}>
                    {t('cooperative.reports.dailyTarget.areas')}: {group.area_names.join(', ') || '-'}
                  </div>
                </div>
                <div>
                  <div style={{ color: '#4b5563', fontSize: 10, fontWeight: 700 }}>
                    {t('cooperative.reports.dailyTarget.schedule')}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px 14px', marginTop: 3 }}>
                    {group.collection_schedules.map((schedule) => (
                      <span key={schedule.weekday} style={{ fontSize: 10 }}>
                        <strong>{getCollectionWeekdayLabel(schedule.weekday)}:</strong>{' '}
                        {schedule.area_names.join(', ') || '-'}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <table style={tableStyle}>
                <colgroup>
                  <col style={{ width: 90 }} />
                  {Array.from({ length: 4 }, (_, index) => <col key={`member-${index}`} style={{ width: 42 }} />)}
                  {Array.from({ length: 4 }, (_, index) => <col key={`target-${index}`} style={{ width: 108 }} />)}
                  <col style={{ width: 108 }} />
                  <col style={{ width: 46 }} />
                  {Array.from({ length: 7 }, (_, index) => <col key={`tail-${index}`} style={{ width: 108 }} />)}
                </colgroup>
                {renderHeader(labels)}
                <tbody>
                  {group.weeks.flatMap((week) => (
                    <tr
                      key={`${group.key}:${week.key}:marker`}
                      data-testid={`koperasi-daily-target-week-${token}-${week.week_index}`}
                      style={{ display: 'none' }}
                    />
                  ))}
                  {renderWeekRows(group, t('cooperative.reports.dailyTarget.weekTotal'))}
                  <tr style={totalStyle} data-testid={`koperasi-daily-target-total-${token}`}>
                    <td style={tdStyle}>{t('common.total')}</td>
                    {renderValueCells(group.summary)}
                  </tr>
                </tbody>
              </table>
            </section>
          );
        })}

        {groups.length > 1 ? (
          <table style={{ ...tableStyle, marginTop: 12 }}>
            {renderHeader(labels)}
            <tbody>
              <tr style={totalStyle} data-testid="koperasi-daily-target-grand-total">
                <td style={tdStyle}>{t('cooperative.reports.dailyTarget.grandTotal')}</td>
                {renderValueCells(summary)}
              </tr>
            </tbody>
          </table>
        ) : null}
      </div>
    );
  },
);

export default CooperativeDailyTargetReport;
