import { forwardRef, type CSSProperties } from 'react';
import { Building2 } from 'lucide-react';
import { useI18n } from '@/hooks/useI18n';
import dayjs from '@/lib/dayjs';
import type {
  CooperativeIptwReportData,
  CooperativeIptwReportEmployeeColumn,
  CooperativeIptwReportRow,
} from '@/services/cooperativeIptwReportService';
import { formatCurrency } from '@/utils/formatters';

type CooperativeIptwReportProps = {
  data?: CooperativeIptwReportData;
  companyName: string;
  logoDataUrl?: string;
  periodText: string;
  printDateText: string;
};

const FIXED_COLUMNS_WIDTH = 720;
const EMPLOYEE_COLUMN_WIDTH = 150;

const reportWrapperStyle = (employeeCount: number): CSSProperties => ({
  background: '#ffffff',
  border: '1px solid #e5e7eb',
  color: '#111827',
  fontFamily: 'Arial, sans-serif',
  minWidth: FIXED_COLUMNS_WIDTH + (Math.max(employeeCount, 1) * EMPLOYEE_COLUMN_WIDTH),
  padding: 24,
});

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

const summaryStyle: CSSProperties = {
  border: '1px solid #d1d5db',
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  marginBottom: 18,
  maxWidth: 520,
  marginLeft: 'auto',
};

const summaryCellStyle: CSSProperties = {
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
  fontSize: 11,
  padding: '8px 7px',
  textAlign: 'left',
  verticalAlign: 'middle',
};

const tdStyle: CSSProperties = {
  border: '1px solid #d1d5db',
  fontSize: 11,
  overflowWrap: 'break-word',
  padding: '7px 7px',
  verticalAlign: 'top',
};

const numberCellStyle: CSSProperties = {
  ...tdStyle,
  textAlign: 'right',
  whiteSpace: 'nowrap',
};

const totalRowStyle: CSSProperties = {
  background: '#f3f4f6',
  fontWeight: 700,
};

const money = (value: number) => `Rp ${formatCurrency(value || 0)}`;

const moneyOrDash = (value: number) => Math.abs(value) > 0.01 ? money(value) : '-';

const employeeLabel = (employee: CooperativeIptwReportEmployeeColumn) => (
  employee.position ? `${employee.name} - ${employee.position}` : employee.name
);

const renderRow = (
  row: CooperativeIptwReportRow,
  employees: CooperativeIptwReportEmployeeColumn[],
) => (
  <tr key={row.id} data-testid={`koperasi-iptw-row-${row.id}`}>
    <td style={tdStyle}>{row.member_number}</td>
    <td style={tdStyle}>{dayjs(row.event_date).tz().format('DD.MM.YYYY')}</td>
    <td style={tdStyle}>{row.member_name}</td>
    <td style={tdStyle}>{row.member_address || '-'}</td>
    {employees.map((employee) => (
      <td key={employee.id} style={numberCellStyle}>
        {moneyOrDash(row.employee_amounts[employee.id] ?? 0)}
      </td>
    ))}
    <td style={{ ...numberCellStyle, fontWeight: 700 }}>{money(row.total_amount)}</td>
  </tr>
);

const CooperativeIptwReport = forwardRef<HTMLDivElement, CooperativeIptwReportProps>(
  function CooperativeIptwReport({
    data,
    companyName,
    logoDataUrl,
    periodText,
    printDateText,
  }, ref) {
    const { t } = useI18n();
    const rows = data?.rows ?? [];
    const employees = data?.employee_columns ?? [];
    const totalAmount = data?.total_amount ?? 0;

    return (
      <div
        ref={ref}
        style={reportWrapperStyle(employees.length)}
        data-testid="koperasi-iptw-report"
      >
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
            <div>{t('cooperative.iptwReport.month')}: {periodText}</div>
            <div>{t('report.printDate')} {printDateText}</div>
          </div>
        </div>

        <div style={reportTitleStyle}>
          <div style={{ fontSize: 18, fontWeight: 700, textTransform: 'uppercase' }}>
            {t('cooperative.iptwReport.title')}
          </div>
          <div style={{ color: '#4b5563', fontSize: 12, marginTop: 4 }}>
            {t('cooperative.iptwReport.subtitle')}
          </div>
        </div>

        <div style={summaryStyle}>
          <div style={{ ...summaryCellStyle, borderRight: '1px solid #d1d5db' }}>
            <div style={{ color: '#4b5563', fontSize: 11, fontWeight: 700 }}>
              {t('cooperative.iptwReport.rowCount')}
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, marginTop: 5, textAlign: 'right' }}>
              {rows.length}
            </div>
          </div>
          <div style={summaryCellStyle}>
            <div style={{ color: '#4b5563', fontSize: 11, fontWeight: 700 }}>
              {t('cooperative.iptwReport.grandTotal')}
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, marginTop: 5, textAlign: 'right' }}>
              {money(totalAmount)}
            </div>
          </div>
        </div>

        <table style={tableStyle}>
          <colgroup>
            <col style={{ width: 105 }} />
            <col style={{ width: 95 }} />
            <col style={{ width: 170 }} />
            <col style={{ width: 210 }} />
            {employees.map((employee) => (
              <col key={employee.id} style={{ width: EMPLOYEE_COLUMN_WIDTH }} />
            ))}
            <col style={{ width: 140 }} />
          </colgroup>
          <thead>
            <tr>
              <th style={thStyle}>{t('cooperative.iptwReport.memberCode')}</th>
              <th style={thStyle}>{t('cooperative.reports.table.date')}</th>
              <th style={thStyle}>{t('cooperative.iptwReport.name')}</th>
              <th style={thStyle}>{t('cooperative.iptwReport.address')}</th>
              {employees.map((employee) => (
                <th key={employee.id} style={{ ...thStyle, textAlign: 'right' }}>
                  {employeeLabel(employee)}
                </th>
              ))}
              <th style={{ ...thStyle, textAlign: 'right' }}>{t('common.total')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  style={{ ...tdStyle, textAlign: 'center' }}
                  colSpan={5 + employees.length}
                >
                  {t('cooperative.iptwReport.empty')}
                </td>
              </tr>
            ) : (
              <>
                {rows.map((row) => renderRow(row, employees))}
                <tr style={totalRowStyle} data-testid="koperasi-iptw-total">
                  <td style={tdStyle} colSpan={4}>{t('common.total')}</td>
                  {employees.map((employee) => (
                    <td key={employee.id} style={numberCellStyle}>
                      {money(data?.employee_totals[employee.id] ?? 0)}
                    </td>
                  ))}
                  <td style={numberCellStyle}>{money(totalAmount)}</td>
                </tr>
              </>
            )}
          </tbody>
        </table>
      </div>
    );
  },
);

export default CooperativeIptwReport;
