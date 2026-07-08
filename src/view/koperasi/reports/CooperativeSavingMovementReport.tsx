import { forwardRef, type CSSProperties } from 'react';
import { Building2 } from 'lucide-react';
import { useI18n } from '@/hooks/useI18n';
import dayjs from '@/lib/dayjs';
import type {
  CooperativeSavingMovementDirection,
  CooperativeSavingMovementReport as CooperativeSavingMovementReportData,
  CooperativeSavingMovementReportGroup,
  CooperativeSavingMovementReportRow,
  CooperativeSavingMovementReportSummary,
} from '@/services/cooperativeSavingMovementReportService';
import type { CooperativeSavingType } from '@/types';
import { formatCurrency } from '@/utils/formatters';

type CooperativeSavingMovementReportProps = {
  data?: CooperativeSavingMovementReportData;
  companyName: string;
  logoDataUrl?: string;
  direction: CooperativeSavingMovementDirection;
  monthText: string;
  employeeText: string;
  savingTypeText: string;
  printDateText: string;
};

const REPORT_MIN_WIDTH = 1120;

const emptySummary: CooperativeSavingMovementReportSummary = {
  row_count: 0,
  total_amount: 0,
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
  gridTemplateColumns: '160px 1fr 220px',
  marginBottom: 18,
};

const summaryCellStyle: CSSProperties = {
  borderRight: '1px solid #d1d5db',
  minHeight: 62,
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
  alignItems: 'center',
  background: '#f3f4f6',
  borderBottom: '1px solid #d1d5db',
  display: 'flex',
  justifyContent: 'space-between',
  padding: '10px 12px',
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

const totalRowStyle: CSSProperties = {
  background: '#f9fafb',
  fontWeight: 700,
};

const money = (value: number) => `Rp ${formatCurrency(value || 0)}`;

const formatDateText = (value: string) => dayjs(value).tz().format('DD.MM.YYYY');

const formatTimeText = (value: string) => dayjs(value).tz().format('HH:mm');

const formatDayName = (value: string) => dayjs(value).tz().format('dddd').toUpperCase();

const getEmployeeLabel = (
  row: Pick<CooperativeSavingMovementReportRow, 'employee_name' | 'employee_position'>,
  unassignedLabel: string,
) => {
  if (!row.employee_name) return unassignedLabel;
  return row.employee_position ? `${row.employee_name} - ${row.employee_position}` : row.employee_name;
};

const renderSummaryItems = (
  summary: CooperativeSavingMovementReportSummary,
  labels: {
    transactionCount: string;
    savingType: string;
    totalAmount: string;
  },
  savingTypeText: string,
) => [
  { key: 'count', label: labels.transactionCount, value: summary.row_count },
  { key: 'savingType', label: labels.savingType, value: savingTypeText },
  { key: 'amount', label: labels.totalAmount, value: money(summary.total_amount) },
];

const CooperativeSavingMovementReport = forwardRef<HTMLDivElement, CooperativeSavingMovementReportProps>(
  function CooperativeSavingMovementReport({
    data,
    companyName,
    logoDataUrl,
    direction,
    monthText,
    employeeText,
    savingTypeText,
    printDateText,
  }, ref) {
    const { t } = useI18n();
    const groups = data?.groups ?? [];
    const totalSummary = data?.summary ?? emptySummary;
    const isIncoming = direction === 'IN';
    const labels = {
      title: isIncoming
        ? t('cooperative.savingMovementReport.in.title')
        : t('cooperative.savingMovementReport.out.title'),
      subtitle: isIncoming
        ? t('cooperative.savingMovementReport.in.subtitle')
        : t('cooperative.savingMovementReport.out.subtitle'),
      month: t('cooperative.savingMovementReport.month'),
      employee: t('cooperative.savingMovementReport.employee'),
      savingType: t('cooperative.savingMovementReport.savingType'),
      transactionCount: t('cooperative.savingMovementReport.transactionCount'),
      totalAmount: t('cooperative.savingMovementReport.totalAmount'),
      date: t('cooperative.reports.table.date'),
      time: t('cooperative.savingMovementReport.time'),
      day: t('cooperative.savingMovementReport.day'),
      member: t('cooperative.reports.table.member'),
      officer: t('cooperative.reports.table.officer'),
      cashAccount: t('cooperative.reports.table.cashAccount'),
      withdrawalSource: t('cooperative.savingMovementReport.withdrawalSource'),
      notes: t('cooperative.savingMovementReport.notes'),
      amount: t('cooperative.reports.table.amount'),
      empty: t('cooperative.savingMovementReport.empty'),
      unassigned: t('cooperative.savingMovementReport.unassignedEmployee'),
    };
    const savingTypeLabel = (savingType: CooperativeSavingType) => {
      if (savingType === 'POKOK') return t('cooperative.savings.type.pokok');
      if (savingType === 'WAJIB') return t('cooperative.savings.type.wajib');
      return t('cooperative.savings.type.sukarela');
    };
    const withdrawalSourceLabel = (row: CooperativeSavingMovementReportRow) => {
      if (direction === 'IN') return '-';
      return row.withdrawal_source === 'INTEREST'
        ? t('cooperative.savings.withdrawalSource.interestShort')
        : t('cooperative.savings.withdrawalSource.savingShort');
    };
    const renderGroup = (group: CooperativeSavingMovementReportGroup) => (
      <section key={group.key} style={groupStyle} data-testid={`koperasi-saving-movement-group-${group.date_key}`}>
        <div style={groupHeaderStyle}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>
              {formatDateText(group.date_key)} - {formatDayName(group.date_key)}
            </div>
            <div style={{ color: '#4b5563', fontSize: 12, marginTop: 2 }}>
              {group.summary.row_count} {labels.transactionCount.toLowerCase()}
            </div>
          </div>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{money(group.summary.total_amount)}</div>
        </div>
        <table style={tableStyle}>
          <colgroup>
            <col style={{ width: 70 }} />
            <col style={{ width: 170 }} />
            <col style={{ width: 180 }} />
            <col style={{ width: 110 }} />
            <col style={{ width: 170 }} />
            <col style={{ width: 150 }} />
            <col />
            <col style={{ width: 150 }} />
          </colgroup>
          <thead>
            <tr>
              <th style={thStyle}>{labels.time}</th>
              <th style={thStyle}>{labels.member}</th>
              <th style={thStyle}>{labels.officer}</th>
              <th style={thStyle}>{labels.savingType}</th>
              <th style={thStyle}>{labels.cashAccount}</th>
              <th style={thStyle}>{labels.withdrawalSource}</th>
              <th style={thStyle}>{labels.notes}</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>{labels.amount}</th>
            </tr>
          </thead>
          <tbody>
            {group.rows.map((row) => (
              <tr key={row.id} data-testid={`koperasi-saving-movement-row-${row.transaction_id}`}>
                <td style={tdStyle}>{formatTimeText(row.transaction_date)}</td>
                <td style={tdStyle}>
                  <div style={{ fontWeight: 700 }}>{row.member_name}</div>
                  <div style={{ color: '#4b5563', fontSize: 11, marginTop: 2 }}>{row.member_number}</div>
                </td>
                <td style={tdStyle}>{getEmployeeLabel(row, labels.unassigned)}</td>
                <td style={tdStyle}>{savingTypeLabel(row.saving_type)}</td>
                <td style={tdStyle}>
                  <div>{row.cash_account_name ?? '-'}</div>
                  {row.cash_account_code ? (
                    <div style={{ color: '#4b5563', fontSize: 11, marginTop: 2 }}>{row.cash_account_code}</div>
                  ) : null}
                </td>
                <td style={tdStyle}>{withdrawalSourceLabel(row)}</td>
                <td style={tdStyle}>{row.notes || row.payment_channel || '-'}</td>
                <td style={numberCellStyle}>{money(row.amount)}</td>
              </tr>
            ))}
            <tr style={totalRowStyle} data-testid={`koperasi-saving-movement-total-${group.date_key}`}>
              <td style={tdStyle} colSpan={7}>{t('common.total')}</td>
              <td style={numberCellStyle}>{money(group.summary.total_amount)}</td>
            </tr>
          </tbody>
        </table>
      </section>
    );

    return (
      <div ref={ref} style={reportWrapperStyle} data-testid="koperasi-saving-movement-report">
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
            <div>{labels.employee}: {employeeText}</div>
            <div>{labels.savingType}: {savingTypeText}</div>
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
          {renderSummaryItems(totalSummary, labels, savingTypeText).map((item, index) => (
            <div
              key={item.key}
              style={{
                ...summaryCellStyle,
                borderRight: index === 2 ? 'none' : summaryCellStyle.borderRight,
              }}
            >
              <div style={summaryLabelStyle}>{item.label}</div>
              <div style={summaryValueStyle}>{item.value}</div>
            </div>
          ))}
        </div>

        {groups.length === 0 ? (
          <div style={{ ...tdStyle, padding: 18, textAlign: 'center' }}>{labels.empty}</div>
        ) : (
          groups.map(renderGroup)
        )}
      </div>
    );
  },
);

export default CooperativeSavingMovementReport;
