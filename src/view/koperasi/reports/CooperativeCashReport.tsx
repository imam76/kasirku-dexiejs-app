import { forwardRef, type CSSProperties } from 'react';
import { Building2 } from 'lucide-react';
import { useI18n } from '@/hooks/useI18n';
import type {
  CooperativeCashReport as CooperativeCashReportData,
  CooperativeCashReportEmployee,
  CooperativeCashReportRowKey,
} from '@/services/cooperativeCashReportService';
import { formatCurrency } from '@/utils/formatters';

type CooperativeCashReportProps = {
  data?: CooperativeCashReportData;
  companyName: string;
  logoDataUrl?: string;
  dateText: string;
  dayText: string;
  employeeText: string;
  printDateText: string;
};

const reportWrapperStyle: CSSProperties = {
  background: '#ffffff',
  border: '1px solid #e5e7eb',
  color: '#111827',
  fontFamily: 'Arial, sans-serif',
  minWidth: 680,
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

const tableStyle: CSSProperties = {
  borderCollapse: 'collapse',
  tableLayout: 'fixed',
  width: '100%',
};

const cellStyle: CSSProperties = {
  border: '1px solid #9ca3af',
  fontSize: 13,
  padding: '10px 12px',
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

const money = (value: number) => `Rp ${formatCurrency(value || 0)}`;

const rowLabelKeys = {
  STORTING: 'cooperative.cashReport.storting',
  DROPING: 'cooperative.cashReport.dropping',
  TABUNGAN: 'cooperative.cashReport.saving',
  IPTW: 'cooperative.cashReport.iptw',
} as const satisfies Record<CooperativeCashReportRowKey, string>;

const EmployeeCashReport = ({
  employee,
  labels,
}: {
  employee: CooperativeCashReportEmployee;
  labels: {
    employee: string;
    description: string;
    incoming: string;
    outgoing: string;
    total: string;
    totalBalance: string;
  };
}) => {
  const { t } = useI18n();

  return (
    <section
      style={{ breakInside: 'avoid', marginBottom: 24 }}
      data-testid={`koperasi-cash-report-employee-${employee.employee_id}`}
    >
      <div style={{ fontSize: 13, marginBottom: 8 }}>
        <strong>{labels.employee}:</strong>{' '}
        {employee.employee_name} ({employee.employee_code || '-'})
      </div>
      {employee.employee_position ? (
        <div style={{ color: '#4b5563', fontSize: 12, marginBottom: 10 }}>
          {employee.employee_position}
        </div>
      ) : null}

      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={{ ...headerCellStyle, textAlign: 'left', width: '40%' }}>
              {labels.description}
            </th>
            <th style={headerCellStyle}>{labels.incoming}</th>
            <th style={headerCellStyle}>{labels.outgoing}</th>
          </tr>
        </thead>
        <tbody>
          {employee.rows.map((row) => (
            <tr key={row.key}>
              <td style={{ ...cellStyle, fontWeight: 600 }}>{t(rowLabelKeys[row.key])}</td>
              <td style={numberCellStyle}>{money(row.incoming_amount)}</td>
              <td style={numberCellStyle}>{money(row.outgoing_amount)}</td>
            </tr>
          ))}
          <tr style={{ background: '#f9fafb', fontWeight: 700 }}>
            <td style={cellStyle}>{labels.total}</td>
            <td style={numberCellStyle}>{money(employee.total_incoming_amount)}</td>
            <td style={numberCellStyle}>{money(employee.total_outgoing_amount)}</td>
          </tr>
        </tbody>
      </table>

      <div
        style={{
          alignItems: 'center',
          border: '1px solid #111827',
          borderTop: 0,
          display: 'flex',
          fontSize: 14,
          fontWeight: 700,
          justifyContent: 'space-between',
          padding: '12px',
        }}
      >
        <span>{labels.totalBalance}</span>
        <span>{money(employee.total_balance_amount)}</span>
      </div>
    </section>
  );
};

const CooperativeCashReport = forwardRef<HTMLDivElement, CooperativeCashReportProps>(
  function CooperativeCashReport({
    data,
    companyName,
    logoDataUrl,
    dateText,
    dayText,
    employeeText,
    printDateText,
  }, ref) {
    const { t } = useI18n();
    const labels = {
      title: t('cooperative.cashReport.title'),
      employee: t('cooperative.cashReport.employee'),
      day: t('cooperative.cashReport.day'),
      date: t('cooperative.cashReport.date'),
      description: t('cooperative.cashReport.description'),
      incoming: t('cooperative.cashReport.incoming'),
      outgoing: t('cooperative.cashReport.outgoing'),
      total: t('cooperative.cashReport.total'),
      totalBalance: t('cooperative.cashReport.totalBalance'),
    };

    return (
      <div ref={ref} style={reportWrapperStyle} data-testid="koperasi-cash-report">
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
            <div>{labels.employee}: {employeeText}</div>
            <div>{labels.day}: {dayText}</div>
            <div>{labels.date}: {dateText}</div>
            <div>{t('report.printDate')} {printDateText}</div>
          </div>
        </div>

        <div style={{ marginBottom: 20, textAlign: 'center' }}>
          <div style={{ fontSize: 20, fontWeight: 700, textTransform: 'uppercase' }}>
            {labels.title}
          </div>
        </div>

        {data?.employees.length ? data.employees.map((employee) => (
          <EmployeeCashReport key={employee.employee_id} employee={employee} labels={labels} />
        )) : (
          <table style={tableStyle}>
            <tbody>
              <tr>
                <td style={{ ...cellStyle, textAlign: 'center' }}>
                  {t('cooperative.cashReport.empty')}
                </td>
              </tr>
            </tbody>
          </table>
        )}
      </div>
    );
  },
);

export default CooperativeCashReport;
