import { forwardRef, type CSSProperties } from 'react';
import { Building2 } from 'lucide-react';
import { useI18n } from '@/hooks/useI18n';
import dayjs from '@/lib/dayjs';
import type {
  CooperativeInstallmentBookAgingCategory,
  CooperativeInstallmentBookReport as CooperativeInstallmentBookReportData,
  CooperativeInstallmentBookReportRow,
  CooperativeInstallmentBookReportSection,
  CooperativeInstallmentBookReportSummary,
} from '@/services/cooperativeInstallmentBookReportService';
import { formatCurrency } from '@/utils/formatters';
import { roundCurrency } from '@/utils/koperasi/loanSchedule';
import { getCollectionWeekdayLabel } from '@/utils/koperasi/collectionSchedule';

type CooperativeInstallmentBookReportProps = {
  data?: CooperativeInstallmentBookReportData;
  companyName: string;
  logoDataUrl?: string;
  periodText: string;
  printDateText: string;
};

const REPORT_MIN_WIDTH = 1280;

const emptySummary: CooperativeInstallmentBookReportSummary = {
  row_count: 0,
  principal_amount: 0,
  opening_balance: 0,
  installment_amount: 0,
  ending_balance: 0,
};

const categoryColors: Record<CooperativeInstallmentBookAgingCategory, {
  header: string;
  row: string;
  text: string;
}> = {
  CURRENT: {
    header: '#dcfce7',
    row: '#f0fdf4',
    text: '#166534',
  },
  WATCHLIST: {
    header: '#fed7aa',
    row: '#fff7ed',
    text: '#9a3412',
  },
  DELINQUENT: {
    header: '#fecaca',
    row: '#fef2f2',
    text: '#991b1b',
  },
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

const summaryGridStyle: CSSProperties = {
  border: '1px solid #d1d5db',
  display: 'grid',
  gridTemplateColumns: 'repeat(5, 1fr)',
  marginBottom: 18,
};

const summaryCellStyle: CSSProperties = {
  borderRight: '1px solid #d1d5db',
  minHeight: 70,
  padding: '10px 12px',
};

const summaryLabelStyle: CSSProperties = {
  color: '#4b5563',
  fontSize: 12,
  fontWeight: 700,
  textTransform: 'uppercase',
};

const summaryValueStyle: CSSProperties = {
  fontSize: 16,
  fontWeight: 700,
  marginTop: 8,
  textAlign: 'right',
};

const areaStyle: CSSProperties = {
  border: '1px solid #d1d5db',
  marginBottom: 22,
};

const areaHeaderStyle: CSSProperties = {
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
  border: '1px solid #9ca3af',
  fontSize: 12,
  padding: '7px 6px',
  textAlign: 'left',
  verticalAlign: 'middle',
};

const tdStyle: CSSProperties = {
  border: '1px solid #d1d5db',
  fontSize: 12,
  overflowWrap: 'break-word',
  padding: '7px 6px',
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

const money = (value: number) => formatCurrency(value || 0);
const moneyOrDash = (value: number) => value ? money(value) : '-';

const getOfficerLabel = (
  group: { officer_name?: string; officer_position?: string },
  unassignedLabel: string,
) => {
  if (!group.officer_name) return unassignedLabel;
  return group.officer_position
    ? `${group.officer_name} - ${group.officer_position}`
    : group.officer_name;
};

const getCollectionDateTotal = (
  rows: CooperativeInstallmentBookReportRow[],
  day: number,
) => roundCurrency(rows.reduce(
  (total, row) => total + (row.payment_by_collection_date[day] ?? 0),
  0,
));

const renderTableHeader = (
  collectionDates: number[],
  labels: {
    date: string;
    memberNumber: string;
    name: string;
    principal: string;
    openingBalance: string;
    collectionDay: string;
    installment: string;
    endingBalance: string;
  },
) => (
  <thead>
    <tr>
      <th style={thStyle} rowSpan={2}>{labels.date}</th>
      <th style={{ ...thStyle, textAlign: 'center' }} rowSpan={2}>{labels.memberNumber}</th>
      <th style={{ ...thStyle, textAlign: 'center' }} rowSpan={2}>L/B</th>
      <th style={thStyle} rowSpan={2}>{labels.name}</th>
      <th style={{ ...thStyle, textAlign: 'right' }} rowSpan={2}>{labels.principal}</th>
      <th style={{ ...thStyle, textAlign: 'right' }} rowSpan={2}>{labels.openingBalance}</th>
      <th style={{ ...thStyle, textAlign: 'center' }} colSpan={collectionDates.length}>
        {labels.collectionDay}
      </th>
      <th style={{ ...thStyle, textAlign: 'right' }} rowSpan={2}>{labels.installment}</th>
      <th style={{ ...thStyle, textAlign: 'right' }} rowSpan={2}>{labels.endingBalance}</th>
    </tr>
    <tr>
      {collectionDates.map((day) => (
        <th key={day} style={{ ...thStyle, textAlign: 'center' }}>{day}</th>
      ))}
    </tr>
  </thead>
);

const renderRow = (
  row: CooperativeInstallmentBookReportRow,
  collectionDates: number[],
  rowColor: string,
) => (
  <tr key={row.id} style={{ background: rowColor }}>
    <td style={tdStyle}>{dayjs(row.loan_date).tz().format('DD.MM.YYYY')}</td>
    <td style={centerCellStyle}>{row.member_number}</td>
    <td style={centerCellStyle}>{row.member_category}</td>
    <td style={tdStyle}>
      <div style={{ fontWeight: 700 }}>{row.member_name}</div>
      <div style={{ color: '#6b7280', fontSize: 12, marginTop: 2 }}>
        Bulan ke-{row.age_month}
      </div>
    </td>
    <td style={numberCellStyle}>{money(row.principal_amount)}</td>
    <td style={{ ...numberCellStyle, color: '#dc2626' }}>{money(row.opening_balance)}</td>
    {collectionDates.map((day) => (
      <td key={day} style={numberCellStyle}>
        {moneyOrDash(row.payment_by_collection_date[day] ?? 0)}
      </td>
    ))}
    <td style={numberCellStyle}>{moneyOrDash(row.installment_amount)}</td>
    <td style={numberCellStyle}>{moneyOrDash(row.ending_balance)}</td>
  </tr>
);

const renderSection = ({
  section,
  collectionDates,
  categoryLabel,
  labels,
}: {
  section: CooperativeInstallmentBookReportSection;
  collectionDates: number[];
  categoryLabel: string;
  labels: Parameters<typeof renderTableHeader>[1];
}) => {
  const colors = categoryColors[section.category];

  return (
    <div key={section.category} style={{ marginBottom: 16 }}>
      <div
        style={{
          background: colors.header,
          borderBottom: '1px solid #9ca3af',
          color: colors.text,
          fontSize: 13,
          fontWeight: 700,
          padding: '8px 12px',
          textTransform: 'uppercase',
        }}
      >
        {categoryLabel}
      </div>
      <table style={tableStyle}>
        <colgroup>
          <col style={{ width: 120 }} />
          <col style={{ width: 86 }} />
          <col style={{ width: 44 }} />
          <col style={{ width: 170 }} />
          <col style={{ width: 125 }} />
          <col style={{ width: 135 }} />
          {collectionDates.map((day) => <col key={day} style={{ width: 100 }} />)}
          <col style={{ width: 125 }} />
          <col style={{ width: 135 }} />
        </colgroup>
        {renderTableHeader(collectionDates, labels)}
        <tbody>
          {section.rows.map((row) => renderRow(row, collectionDates, colors.row))}
          <tr style={{ background: '#67c2d8', fontWeight: 700 }}>
            <td style={tdStyle} colSpan={3}>TOTAL</td>
            <td style={tdStyle}>{section.summary.row_count} anggota</td>
            <td style={numberCellStyle}>{money(section.summary.principal_amount)}</td>
            <td style={numberCellStyle}>{money(section.summary.opening_balance)}</td>
            {collectionDates.map((day) => (
              <td key={day} style={numberCellStyle}>
                {moneyOrDash(getCollectionDateTotal(section.rows, day))}
              </td>
            ))}
            <td style={numberCellStyle}>{money(section.summary.installment_amount)}</td>
            <td style={numberCellStyle}>{money(section.summary.ending_balance)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
};

const CooperativeInstallmentBookReport = forwardRef<
  HTMLDivElement,
  CooperativeInstallmentBookReportProps
>(function CooperativeInstallmentBookReport({
  data,
  companyName,
  logoDataUrl,
  periodText,
  printDateText,
}, ref) {
  const { t } = useI18n();
  const groups = data?.groups ?? [];
  const totalSummary = data?.summary ?? emptySummary;
  const collectionWeekdayLabel = data
    ? getCollectionWeekdayLabel(data.collection_weekday)
    : '-';
  const labels = {
    date: t('cooperative.installmentBook.table.date'),
    memberNumber: t('cooperative.installmentBook.table.memberNumber'),
    name: t('cooperative.installmentBook.table.name'),
    principal: t('cooperative.installmentBook.table.principal'),
    openingBalance: t('cooperative.installmentBook.table.openingBalance'),
    collectionDay: t('cooperative.installmentBook.table.collectionDay', {
      day: collectionWeekdayLabel,
    }),
    installment: t('cooperative.installmentBook.table.installment'),
    endingBalance: t('cooperative.installmentBook.table.endingBalance'),
  };
  const categoryLabels: Record<CooperativeInstallmentBookAgingCategory, string> = {
    CURRENT: t('cooperative.installmentBook.category.current'),
    WATCHLIST: t('cooperative.installmentBook.category.watchlist'),
    DELINQUENT: t('cooperative.installmentBook.category.delinquent'),
  };
  const summaryItems = [
    { label: t('cooperative.installmentBook.summary.members'), value: totalSummary.row_count },
    { label: labels.principal, value: money(totalSummary.principal_amount) },
    { label: labels.openingBalance, value: money(totalSummary.opening_balance) },
    { label: labels.installment, value: money(totalSummary.installment_amount) },
    { label: labels.endingBalance, value: money(totalSummary.ending_balance) },
  ];

  return (
    <div ref={ref} style={reportWrapperStyle} data-testid="koperasi-installment-book-report">
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

      <div style={{ marginBottom: 18, textAlign: 'center' }}>
        <div style={{ fontSize: 18, fontWeight: 700, textTransform: 'uppercase' }}>
          {t('cooperative.installmentBook.title')}
        </div>
        <div style={{ color: '#4b5563', fontSize: 12, marginTop: 4 }}>
          {t('cooperative.installmentBook.subtitle')}
        </div>
      </div>

      <div style={summaryGridStyle}>
        {summaryItems.map((item, index) => (
          <div
            key={item.label}
            style={{
              ...summaryCellStyle,
              borderRight: index === summaryItems.length - 1 ? 0 : summaryCellStyle.borderRight,
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
                {t('cooperative.installmentBook.empty')}
              </td>
            </tr>
          </tbody>
        </table>
      ) : (
        groups.map((group) => (
          <section key={group.key} style={areaStyle}>
            <div style={areaHeaderStyle}>
              <div>
                <div style={{ color: '#4b5563', fontSize: 12, fontWeight: 700 }}>
                  {t('cooperative.installmentBook.resort')}
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, marginTop: 2 }}>
                  {getOfficerLabel(group, t('cooperative.installmentBook.unassignedResort'))}
                </div>
                <div style={{ color: '#4b5563', fontSize: 12, marginTop: 4 }}>
                  {t('cooperative.installmentBook.areas')}: {group.area_names.join(', ') || '-'}
                </div>
                <div style={{ color: '#4b5563', fontSize: 12, marginTop: 2 }}>
                  {t('cooperative.installmentBook.collectionDays')}: {group.collection_weekdays
                    .map(getCollectionWeekdayLabel)
                    .join(', ') || '-'}
                </div>
              </div>
              <div style={{ fontSize: 13, textAlign: 'right' }}>
                <div>{group.summary.row_count} anggota</div>
                <div style={{ fontWeight: 700, marginTop: 2 }}>
                  {labels.endingBalance}: {money(group.summary.ending_balance)}
                </div>
              </div>
            </div>
            <div style={{ padding: 12 }}>
              {group.sections.map((section) => renderSection({
                section,
                collectionDates: group.collection_dates,
                categoryLabel: categoryLabels[section.category],
                labels,
              }))}
            </div>
          </section>
        ))
      )}
    </div>
  );
});

export default CooperativeInstallmentBookReport;
