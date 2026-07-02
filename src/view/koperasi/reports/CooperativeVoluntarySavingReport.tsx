import { forwardRef, type CSSProperties } from 'react';
import { Building2 } from 'lucide-react';
import { useI18n } from '@/hooks/useI18n';
import type { CooperativeVoluntarySavingReportData } from '@/services/cooperativeVoluntarySavingReportService';
import { formatCurrency } from '@/utils/formatters';

type CooperativeVoluntarySavingReportProps = {
  data?: CooperativeVoluntarySavingReportData;
  companyName: string;
  logoDataUrl?: string;
  asOfDateText: string;
  printDateText: string;
};

const reportWrapperStyle: CSSProperties = {
  background: '#ffffff',
  border: '1px solid #e5e7eb',
  color: '#111827',
  fontFamily: 'Arial, sans-serif',
  minWidth: 760,
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

const tableStyle: CSSProperties = {
  borderCollapse: 'collapse',
  tableLayout: 'fixed',
  width: '100%',
};

const cellStyle: CSSProperties = {
  border: '1px solid #9ca3af',
  fontSize: 13,
  padding: '9px 10px',
  verticalAlign: 'top',
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

const totalRowStyle: CSSProperties = {
  background: '#f9fafb',
  fontWeight: 700,
};

const money = (value: number) => `Rp ${formatCurrency(value || 0)}`;

const CooperativeVoluntarySavingReport = forwardRef<HTMLDivElement, CooperativeVoluntarySavingReportProps>(
  function CooperativeVoluntarySavingReport({
    data,
    companyName,
    logoDataUrl,
    asOfDateText,
    printDateText,
  }, ref) {
    const { t } = useI18n();
    const rows = data?.rows ?? [];
    const summary = data?.summary;

    return (
      <div ref={ref} style={reportWrapperStyle} data-testid="koperasi-voluntary-saving-report">
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
            <div>{t('cooperative.voluntarySavingReport.asOfDate')}: {asOfDateText}</div>
            <div>{t('report.printDate')} {printDateText}</div>
          </div>
        </div>

        <div style={{ marginBottom: 20, textAlign: 'center' }}>
          <div style={{ fontSize: 20, fontWeight: 700, textTransform: 'uppercase' }}>
            {t('cooperative.voluntarySavingReport.title')}
          </div>
          <div style={{ color: '#4b5563', fontSize: 13, marginTop: 4 }}>
            {t('cooperative.voluntarySavingReport.subtitle')}
          </div>
        </div>

        <table style={tableStyle}>
          <colgroup>
            <col />
            <col style={{ width: 170 }} />
            <col style={{ width: 220 }} />
            <col style={{ width: 170 }} />
          </colgroup>
          <thead>
            <tr>
              <th style={{ ...headerCellStyle, textAlign: 'left' }}>
                {t('cooperative.voluntarySavingReport.memberName')}
              </th>
              <th style={headerCellStyle}>{t('cooperative.voluntarySavingReport.balance')}</th>
              <th style={headerCellStyle}>{t('cooperative.voluntarySavingReport.availableInterest')}</th>
              <th style={headerCellStyle}>{t('cooperative.voluntarySavingReport.subTotal')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td style={{ ...cellStyle, textAlign: 'center' }} colSpan={4}>
                  {t('cooperative.voluntarySavingReport.empty')}
                </td>
              </tr>
            ) : (
              <>
                {rows.map((row) => (
                  <tr key={row.id} data-testid={`koperasi-voluntary-saving-row-${row.member_number}`}>
                    <td style={cellStyle}>
                      <div style={{ fontWeight: 700 }}>{row.member_name}</div>
                      <div style={{ color: '#4b5563', fontSize: 12, marginTop: 2 }}>
                        {row.member_number}
                      </div>
                    </td>
                    <td style={numberCellStyle}>{money(row.balance)}</td>
                    <td style={numberCellStyle}>{money(row.available_interest)}</td>
                    <td style={numberCellStyle}>{money(row.sub_total)}</td>
                  </tr>
                ))}
                <tr style={totalRowStyle} data-testid="koperasi-voluntary-saving-total">
                  <td style={cellStyle}>{t('common.total')}</td>
                  <td style={numberCellStyle}>{money(summary?.total_balance ?? 0)}</td>
                  <td style={numberCellStyle}>{money(summary?.total_available_interest ?? 0)}</td>
                  <td style={numberCellStyle}>{money(summary?.total_sub_total ?? 0)}</td>
                </tr>
              </>
            )}
          </tbody>
        </table>
      </div>
    );
  },
);

export default CooperativeVoluntarySavingReport;
