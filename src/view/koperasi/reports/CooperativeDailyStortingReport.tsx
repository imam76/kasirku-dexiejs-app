import { forwardRef, type CSSProperties, type ReactNode } from 'react';
import { Building2 } from 'lucide-react';
import { useI18n } from '@/hooks/useI18n';
import dayjs from '@/lib/dayjs';
import type {
  CooperativeDailyStortingReport as CooperativeDailyStortingReportData,
  CooperativeDailyStortingReportGroup,
  CooperativeDailyStortingReportRow,
  CooperativeDailyStortingReportSummary,
} from '@/services/cooperativeDailyStortingReportService';
import { formatCurrency } from '@/utils/formatters';

type CooperativeDailyStortingReportProps = {
  data?: CooperativeDailyStortingReportData;
  companyName: string;
  logoDataUrl?: string;
  monthText: string;
  collectorText: string;
  printDateText: string;
};

const REPORT_MIN_WIDTH = 1080;

const emptySummary: CooperativeDailyStortingReportSummary = {
  row_count: 0,
  storting_amount: 0,
  drop_margin_amount: 0,
  drop_amount: 0,
  saving_withdrawal_amount: 0,
  cash_amount: 0,
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
  borderRight: '1px solid #d1d5db',
  minHeight: 66,
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
  gridTemplateColumns: '1fr 170px 170px',
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
  color: '#111827',
  fontSize: 12,
  fontWeight: 700,
  padding: '8px 8px',
  textAlign: 'left',
};

const tdStyle: CSSProperties = {
  border: '1px solid #d1d5db',
  fontSize: 12,
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
  group: Pick<CooperativeDailyStortingReportGroup, 'employee_name' | 'employee_position'>,
  unassignedLabel: string,
) => {
  if (!group.employee_name) return unassignedLabel;
  return group.employee_position ? `${group.employee_name} - ${group.employee_position}` : group.employee_name;
};

const summaryItems = (
  summary: CooperativeDailyStortingReportSummary,
  labels: {
    storting: string;
    dropMargin: string;
    drop: string;
    savingWithdrawal: string;
    cash: string;
  },
) => [
  { key: 'storting', label: labels.storting, value: money(summary.storting_amount) },
  { key: 'dropMargin', label: labels.dropMargin, value: money(summary.drop_margin_amount) },
  { key: 'drop', label: labels.drop, value: money(summary.drop_amount) },
  { key: 'savingWithdrawal', label: labels.savingWithdrawal, value: money(summary.saving_withdrawal_amount) },
  { key: 'cash', label: labels.cash, value: money(summary.cash_amount) },
];

const renderAmountCells = (summary: Pick<
  CooperativeDailyStortingReportSummary,
  'storting_amount' | 'drop_margin_amount' | 'drop_amount' | 'saving_withdrawal_amount' | 'cash_amount'
>) => (
  <>
    <td style={numberCellStyle}>{moneyOrDash(summary.storting_amount)}</td>
    <td style={numberCellStyle}>{moneyOrDash(summary.drop_margin_amount)}</td>
    <td style={numberCellStyle}>{moneyOrDash(summary.drop_amount)}</td>
    <td style={numberCellStyle}>{moneyOrDash(summary.saving_withdrawal_amount)}</td>
    <td style={numberCellStyle}>{money(summary.cash_amount)}</td>
  </>
);

const renderRow = (row: CooperativeDailyStortingReportRow) => (
  <tr key={row.id}>
    <td style={tdStyle}>{formatDateDot(row.date_key)}</td>
    <td style={tdStyle}>{formatDayName(row.date_key)}</td>
    {renderAmountCells(row)}
  </tr>
);

const renderWeekRows = (
  group: CooperativeDailyStortingReportGroup,
  totalLabel: string,
): ReactNode[] => group.weeks.flatMap((week) => [
  ...week.rows.map(renderRow),
  <tr key={`${group.key}:${week.key}:subtotal`} style={subtotalRowStyle}>
    <td style={tdStyle} colSpan={2}>{totalLabel}</td>
    {renderAmountCells(week.summary)}
  </tr>,
]);

const CooperativeDailyStortingReport = forwardRef<HTMLDivElement, CooperativeDailyStortingReportProps>(
  function CooperativeDailyStortingReport({
    data,
    companyName,
    logoDataUrl,
    monthText,
    collectorText,
    printDateText,
  }, ref) {
    const { t } = useI18n();
    const groups = data?.groups ?? [];
    const totalSummary = data?.summary ?? emptySummary;
    const labels = {
      title: t('cooperative.reports.dailyStorting.title'),
      subtitle: t('cooperative.reports.dailyStorting.subtitle'),
      month: t('cooperative.reports.dailyStorting.month'),
      collector: t('cooperative.reports.dailyStorting.collector'),
      areas: t('cooperative.reports.dailyStorting.areas'),
      date: t('cooperative.reports.table.date'),
      day: t('cooperative.reports.dailyStorting.day'),
      storting: t('cooperative.reports.dailyStorting.storting'),
      dropMargin: t('cooperative.reports.dailyStorting.dropMargin'),
      drop: t('cooperative.reports.dailyStorting.drop'),
      savingWithdrawal: t('cooperative.reports.dailyStorting.savingWithdrawal'),
      cash: t('cooperative.reports.dailyStorting.cash'),
    };

    return (
      <div ref={ref} style={reportWrapperStyle} data-testid="koperasi-daily-storting-report">
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
            <div>{labels.month}: {monthText}</div>
            <div>{labels.collector}: {collectorText}</div>
            <div>{t('report.printDate')} {printDateText}</div>
          </div>
        </div>

        <div style={reportTitleStyle}>
          <div style={{ fontSize: 18, fontWeight: 700, textTransform: 'uppercase' }}>
            {labels.title}
          </div>
          <div style={{ color: '#4b5563', fontSize: 12, marginTop: 4 }}>
            {labels.subtitle}
          </div>
        </div>

        <div style={summaryGridStyle}>
          {summaryItems(totalSummary, labels).map((item, index) => (
            <div
              key={item.key}
              style={{
                ...summaryCellStyle,
                borderRight: index === 4 ? 0 : summaryCellStyle.borderRight,
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
                  {t('cooperative.reports.dailyStorting.empty')}
                </td>
              </tr>
            </tbody>
          </table>
        ) : (
          groups.map((group) => (
            <section key={group.key} style={groupStyle}>
              <div style={groupHeaderStyle}>
                <div>
                  <div style={{ color: '#4b5563', fontSize: 11, fontWeight: 700 }}>
                    {labels.collector}
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, marginTop: 2 }}>
                    {getCollectorLabel(group, t('cooperative.memberRegister.unassignedEmployee'))}
                  </div>
                  <div style={{ color: '#4b5563', fontSize: 11, marginTop: 4 }}>
                    {labels.areas}: {group.area_names.length > 0 ? group.area_names.join(', ') : '-'}
                  </div>
                </div>
                <div style={groupAmountStyle}>
                  <div style={{ color: '#4b5563', fontSize: 11 }}>{labels.storting}</div>
                  <div style={{ fontWeight: 700 }}>{money(group.summary.storting_amount)}</div>
                </div>
                <div style={groupAmountStyle}>
                  <div style={{ color: '#4b5563', fontSize: 11 }}>{labels.cash}</div>
                  <div style={{ fontWeight: 700 }}>{money(group.summary.cash_amount)}</div>
                </div>
              </div>

              <table style={tableStyle}>
                <colgroup>
                  <col style={{ width: 110 }} />
                  <col style={{ width: 105 }} />
                  <col style={{ width: 150 }} />
                  <col style={{ width: 140 }} />
                  <col style={{ width: 140 }} />
                  <col style={{ width: 140 }} />
                  <col style={{ width: 140 }} />
                </colgroup>
                <thead>
                  <tr>
                    <th style={thStyle}>{labels.date}</th>
                    <th style={thStyle}>{labels.day}</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>{labels.storting}</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>{labels.dropMargin}</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>{labels.drop}</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>{labels.savingWithdrawal}</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>{labels.cash}</th>
                  </tr>
                </thead>
                <tbody>
                  {renderWeekRows(group, t('common.total'))}
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

export default CooperativeDailyStortingReport;
