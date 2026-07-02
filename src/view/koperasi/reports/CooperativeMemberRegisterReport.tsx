import { forwardRef, type CSSProperties } from 'react';
import { Building2 } from 'lucide-react';
import { useI18n } from '@/hooks/useI18n';
import type {
  CooperativeMemberRegisterReportData,
  CooperativeMemberRegisterReportGroup,
} from '@/services/cooperativeMemberRegisterReportService';
import { formatDate } from '@/utils/formatters';

type CooperativeMemberRegisterReportProps = {
  data?: CooperativeMemberRegisterReportData;
  companyName: string;
  logoDataUrl?: string;
  periodText: string;
  printDateText: string;
};

const REPORT_MIN_WIDTH = 980;

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

const summaryStyle: CSSProperties = {
  border: '1px solid #d1d5db',
  display: 'grid',
  gridTemplateColumns: '1fr 180px',
  marginBottom: 18,
};

const summaryCellStyle: CSSProperties = {
  borderRight: '1px solid #d1d5db',
  fontSize: 13,
  padding: '10px 12px',
};

const groupStyle: CSSProperties = {
  border: '1px solid #d1d5db',
  marginBottom: 18,
};

const groupHeaderStyle: CSSProperties = {
  alignItems: 'center',
  background: '#f3f4f6',
  borderBottom: '1px solid #d1d5db',
  display: 'grid',
  gap: 12,
  gridTemplateColumns: '1fr 150px',
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
  fontSize: 13,
  padding: '8px 10px',
  textAlign: 'left',
};

const tdStyle: CSSProperties = {
  border: '1px solid #d1d5db',
  fontSize: 13,
  overflowWrap: 'break-word',
  padding: '8px 10px',
  verticalAlign: 'top',
};

const numberCellStyle: CSSProperties = {
  ...tdStyle,
  textAlign: 'right',
  whiteSpace: 'nowrap',
};

const getOfficerLabel = (
  group: CooperativeMemberRegisterReportGroup,
  unassignedLabel: string,
) => {
  if (!group.officer_name) return unassignedLabel;

  return group.officer_position
    ? `${group.officer_name} - ${group.officer_position}`
    : group.officer_name;
};

const CooperativeMemberRegisterReport = forwardRef<HTMLDivElement, CooperativeMemberRegisterReportProps>(
  function CooperativeMemberRegisterReport({
    data,
    companyName,
    logoDataUrl,
    periodText,
    printDateText,
  }, ref) {
    const { t } = useI18n();
    const groups = data?.groups ?? [];

    return (
      <div ref={ref} style={reportWrapperStyle} data-testid="koperasi-member-register-report">
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
            {t('cooperative.memberRegister.title')}
          </div>
          <div style={{ color: '#4b5563', fontSize: 13, marginTop: 4 }}>
            {t('cooperative.memberRegister.subtitle')}
          </div>
        </div>

        <div style={summaryStyle}>
          <div style={summaryCellStyle}>
            <strong>{t('cooperative.memberRegister.dateRange')}:</strong> {periodText}
          </div>
          <div style={{ ...summaryCellStyle, borderRight: 0, textAlign: 'right' }}>
            <strong>{t('cooperative.memberRegister.totalMembers')}:</strong> {data?.total_member_count ?? 0}
          </div>
        </div>

        {groups.length === 0 ? (
          <table style={tableStyle}>
            <tbody>
              <tr>
                <td style={{ ...tdStyle, textAlign: 'center' }}>
                  {t('cooperative.memberRegister.empty')}
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
                    {t('cooperative.memberRegister.employeeName')}
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, marginTop: 2 }}>
                    {getOfficerLabel(group, t('cooperative.memberRegister.unassignedEmployee'))}
                  </div>
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, textAlign: 'right' }}>
                  {t('cooperative.memberRegister.memberCount', { count: group.member_count })}
                </div>
              </div>

              <table style={tableStyle}>
                <colgroup>
                  <col style={{ width: 130 }} />
                  <col style={{ width: 150 }} />
                  <col style={{ width: 250 }} />
                  <col />
                </colgroup>
                <thead>
                  <tr>
                    <th style={thStyle}>{t('cooperative.memberRegister.table.joinDate')}</th>
                    <th style={thStyle}>{t('cooperative.memberRegister.table.code')}</th>
                    <th style={thStyle}>{t('cooperative.memberRegister.table.name')}</th>
                    <th style={thStyle}>{t('cooperative.memberRegister.table.address')}</th>
                  </tr>
                </thead>
                <tbody>
                  {group.rows.map((row) => (
                    <tr key={row.id}>
                      <td style={tdStyle}>{formatDate(row.join_date)}</td>
                      <td style={tdStyle}>{row.code}</td>
                      <td style={tdStyle}>{row.name}</td>
                      <td style={tdStyle}>{row.address || '-'}</td>
                    </tr>
                  ))}
                  <tr>
                    <td style={numberCellStyle} colSpan={4}>
                      {t('common.total')}: {group.member_count}
                    </td>
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

export default CooperativeMemberRegisterReport;
