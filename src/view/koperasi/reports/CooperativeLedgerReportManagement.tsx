import { useMemo, useState, type CSSProperties } from 'react';
import { App, Alert, Button, DatePicker, Empty, Modal, Select, Space, Tag, Typography } from 'antd';
import type { Dayjs } from 'dayjs';
import autoTable from 'jspdf-autotable';
import { FileTextOutlined } from '@ant-design/icons';
import { BookOpen, Building2, Filter, RefreshCw } from 'lucide-react';
import ExportActions from '@/components/ExportActions';
import { useCompanyProfileSetting } from '@/hooks/useCompanyProfileSetting';
import { useCooperativeLedgerReport } from '@/hooks/useCooperativeLedgerReport';
import { useI18n } from '@/hooks/useI18n';
import type { TranslationKey } from '@/i18n/messages';
import dayjs from '@/lib/dayjs';
import type {
  CooperativeLedgerExportRow,
  CooperativeLedgerReportFilters,
  CooperativeLedgerReportRowType,
} from '@/services/cooperativeLedgerReportService';
import type { ExportRows, ExportTarget } from '@/utils/export';
import { exportCsv, exportPdf } from '@/utils/export';
import { formatCurrency, formatDate } from '@/utils/formatters';

const { Text, Title } = Typography;

const ALL_VALUE = '__ALL__';

const rowTypeLabelKey: Record<CooperativeLedgerReportRowType, TranslationKey> = {
  OPENING: 'cooperative.ledger.rowType.opening',
  MOVEMENT: 'cooperative.ledger.rowType.movement',
  ENDING: 'cooperative.ledger.rowType.ending',
};

const REPORT_TABLE_MIN_WIDTH = 1320;

const ledgerColumnWidths: CSSProperties[] = [
  { width: 150 },
  { width: 170 },
  { width: 120 },
  { width: 210 },
  { width: 340 },
  { width: 130 },
  { width: 120 },
  { width: 150 },
];

const reportWrapperStyle: CSSProperties = {
  background: '#ffffff',
  border: '1px solid #e5e7eb',
  color: '#111827',
  fontFamily: 'Arial, sans-serif',
  minWidth: REPORT_TABLE_MIN_WIDTH,
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

const accountSectionStyle: CSSProperties = {
  border: '1px solid #d1d5db',
  marginBottom: 18,
  minWidth: REPORT_TABLE_MIN_WIDTH - 48,
};

const accountHeaderStyle: CSSProperties = {
  background: '#f3f4f6',
  borderBottom: '1px solid #d1d5db',
  display: 'grid',
  gap: 10,
  gridTemplateColumns: 'minmax(420px, 1fr) 130px 130px 130px 150px',
  padding: '10px 12px',
};

const accountSummaryCellStyle: CSSProperties = {
  minWidth: 0,
  textAlign: 'right',
};

const tableStyle: CSSProperties = {
  borderCollapse: 'collapse',
  minWidth: REPORT_TABLE_MIN_WIDTH - 48,
  tableLayout: 'fixed',
  width: '100%',
};

const thStyle: CSSProperties = {
  background: '#f9fafb',
  border: '1px solid #d1d5db',
  fontSize: 12,
  padding: '8px 10px',
  textAlign: 'left',
};

const tdStyle: CSSProperties = {
  border: '1px solid #d1d5db',
  fontSize: 12,
  overflowWrap: 'break-word',
  padding: '8px 10px',
  verticalAlign: 'top',
};

const numberCellStyle: CSSProperties = {
  ...tdStyle,
  textAlign: 'right',
  whiteSpace: 'nowrap',
};

const money = (value: number) => `Rp ${formatCurrency(value || 0)}`;

const dateText = (value?: string) => value ? formatDate(value) : '-';

const getSignedStyle = (value: number): CSSProperties => ({
  color: value < 0 ? '#dc2626' : '#111827',
  fontWeight: 600,
});

const getOptionSortKey = (item: { code?: string; name: string; id: string }) => (
  item.code?.trim() || item.name || item.id
).toLowerCase();

const toSelectOptions = (items: Array<{ id: string; code?: string; name: string }>) => [
  { value: ALL_VALUE, label: 'All' },
  ...[...items]
    .sort((left, right) => getOptionSortKey(left).localeCompare(getOptionSortKey(right), undefined, { numeric: true }))
    .map((item) => ({
      value: item.id,
      label: item.code ? `${item.code} - ${item.name}` : item.name,
    })),
];

const getFilterCount = (filters: CooperativeLedgerReportFilters) => (
  (filters.startDate || filters.endDate ? 1 : 0) +
  (filters.fromAccountId || filters.toAccountId ? 1 : 0)
);

const getDefaultFilters = (): CooperativeLedgerReportFilters => ({
  startDate: dayjs.tz().startOf('month').toISOString(),
  endDate: dayjs.tz().endOf('month').toISOString(),
});

export default function CooperativeLedgerReportManagement() {
  const { message } = App.useApp();
  const { t } = useI18n();
  const { profile } = useCompanyProfileSetting();
  const [filters, setFilters] = useState<CooperativeLedgerReportFilters>(() => getDefaultFilters());
  const [draftFilters, setDraftFilters] = useState<CooperativeLedgerReportFilters>(() => getDefaultFilters());
  const [filterOpen, setFilterOpen] = useState(false);
  const reportQuery = useCooperativeLedgerReport(filters);
  const data = reportQuery.data;
  const isLoading = reportQuery.isLoading || reportQuery.isFetching;
  const filterCount = getFilterCount(filters);
  const accountOptions = useMemo(() => toSelectOptions(data?.accounts ?? []), [data?.accounts]);
  const dateRange = useMemo<[Dayjs, Dayjs] | null>(() => {
    if (!draftFilters.startDate || !draftFilters.endDate) return null;
    return [dayjs(draftFilters.startDate).tz(), dayjs(draftFilters.endDate).tz()];
  }, [draftFilters.endDate, draftFilters.startDate]);

  const periodText = `${filters.startDate ? dayjs(filters.startDate).tz().format('YYYY-MM-DD') : t('common.all')} - ${filters.endDate ? dayjs(filters.endDate).tz().format('YYYY-MM-DD') : t('common.all')}`;
  const reportRows = data?.exportRows ?? [];
  const companyName = profile?.company_name || t('cooperative.ledger.companyFallback');

  const getRowTypeLabel = (rowType?: CooperativeLedgerReportRowType) => (
    rowType ? t(rowTypeLabelKey[rowType]) : '-'
  );

  const buildCsvRows = (): ExportRows => {
    const rows: ExportRows = [
      [t('cooperative.ledger.title'), dayjs().tz().format('YYYY-MM-DD HH:mm:ss')],
      [t('cooperative.ledger.period'), periodText],
      [],
      [
        t('generalLedger.account'),
        t('cooperative.reports.table.rowType'),
        t('generalLedger.journal.date'),
        t('generalLedger.journal.number'),
        t('generalLedger.journal.source'),
        t('generalLedger.journal.description'),
        t('generalLedger.debit'),
        t('generalLedger.credit'),
        t('generalLedger.ledger.runningBalance'),
      ],
    ];

    reportRows.forEach((row) => {
      if (row.kind === 'ACCOUNT') {
        rows.push([]);
        rows.push([
          `${row.account_code} - ${row.account_name}`,
          t('cooperative.ledger.accountSummary'),
          '',
          '',
          '',
          `${t('cooperative.ledger.openingBalance')}: ${row.opening_balance ?? 0}; ${t('cooperative.ledger.endingBalance')}: ${row.ending_balance ?? 0}`,
          row.debit ?? 0,
          row.credit ?? 0,
          row.ending_balance ?? 0,
        ]);
        return;
      }

      if (row.kind === 'ROW') {
        rows.push([
          `${row.account_code} - ${row.account_name}`,
          getRowTypeLabel(row.row_type),
          row.date ? dayjs(row.date).tz().format('YYYY-MM-DD HH:mm') : '',
          row.entry_number ?? '',
          row.source_number ?? '',
          row.description ?? '',
          row.debit ?? 0,
          row.credit ?? 0,
          row.running_balance ?? 0,
        ]);
      }
    });

    return rows;
  };

  const buildPdfBody = (rows: CooperativeLedgerExportRow[]) => rows
    .filter((row) => row.kind !== 'HEADER')
    .map((row) => {
      if (row.kind === 'ACCOUNT') {
        return [
          `${row.account_code} - ${row.account_name}`,
          t('cooperative.ledger.accountSummary'),
          '',
          '',
          t('cooperative.ledger.openingBalance'),
          formatCurrency(row.opening_balance ?? 0),
          formatCurrency(row.debit ?? 0),
          formatCurrency(row.credit ?? 0),
          formatCurrency(row.ending_balance ?? 0),
        ];
      }

      return [
        `${row.account_code} - ${row.account_name}`,
        getRowTypeLabel(row.row_type),
        row.date ? dayjs(row.date).tz().format('YYYY-MM-DD HH:mm') : '',
        row.entry_number ?? '',
        row.source_number ?? '',
        row.description ?? '',
        formatCurrency(row.debit ?? 0),
        formatCurrency(row.credit ?? 0),
        formatCurrency(row.running_balance ?? 0),
      ];
    });

  const handleOpenFilter = () => {
    setDraftFilters(filters);
    setFilterOpen(true);
  };

  const handleApplyFilter = () => {
    setFilters(draftFilters);
    setFilterOpen(false);
  };

  const handleResetFilter = () => {
    const defaultFilters = getDefaultFilters();
    setDraftFilters(defaultFilters);
    setFilters(defaultFilters);
  };

  const handleExportCsv = async (target: ExportTarget = 'auto') => {
    if (!data) return;

    try {
      const exported = await exportCsv({
        filename: `buku-besar-koperasi-${dayjs().tz().format('YYYY-MM-DD')}.csv`,
        rows: buildCsvRows(),
        target,
      });
      if (!exported) return;
      message.success(t('cooperative.ledger.exportCsvSuccess'));
    } catch (error) {
      console.error('Failed to export cooperative ledger CSV:', error);
      message.error(t('cooperative.ledger.exportCsvFailed'));
    }
  };

  const handleExportPdf = async (target: ExportTarget = 'auto') => {
    if (!data) return;

    try {
      const exported = await exportPdf({
        filename: `buku-besar-koperasi-${dayjs().tz().format('YYYY-MM-DD')}.pdf`,
        target,
        build: (doc) => {
          doc.setFontSize(12);
          doc.text(companyName, 14, 16);
          doc.setFontSize(11);
          doc.text(t('cooperative.ledger.subtitle'), 14, 24);
          doc.setFontSize(10);
          doc.text(`${t('cooperative.ledger.period')}: ${periodText}`, 14, 32);
          doc.text(`${t('report.printDate')} ${dayjs().tz().format('YYYY-MM-DD HH:mm:ss')}`, 14, 38);

          autoTable(doc, {
            startY: 44,
            head: [[
              t('generalLedger.account'),
              t('cooperative.reports.table.rowType'),
              t('generalLedger.journal.date'),
              t('generalLedger.journal.number'),
              t('generalLedger.journal.source'),
              t('generalLedger.journal.description'),
              t('generalLedger.debit'),
              t('generalLedger.credit'),
              t('generalLedger.ledger.runningBalance'),
            ]],
            body: buildPdfBody(data.exportRows),
            theme: 'grid',
            styles: { fontSize: 7, cellPadding: 1.5 },
            headStyles: { fillColor: [17, 24, 39], textColor: 255 },
            columnStyles: {
              6: { halign: 'right' },
              7: { halign: 'right' },
              8: { halign: 'right' },
            },
          });
        },
      });
      if (!exported) return;
      message.success(t('cooperative.ledger.exportPdfSuccess'));
    } catch (error) {
      console.error('Failed to export cooperative ledger PDF:', error);
      message.error(t('cooperative.ledger.exportPdfFailed'));
    }
  };

  return (
    <div className="space-y-4 p-3 sm:p-4 md:p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <Title level={2} className="!mb-1 flex items-center gap-2">
            <BookOpen size={24} />
            {t('nav.cooperative.ledger')}
          </Title>
          <Text type="secondary">{t('cooperative.ledger.subtitle')}</Text>
        </div>
        <Space wrap>
          <Button icon={<Filter size={16} />} onClick={handleOpenFilter}>
            {filterCount > 0 ? t('cooperative.ledger.filterWithCount', { count: filterCount }) : t('cooperative.ledger.filter')}
          </Button>
          <Button icon={<RefreshCw size={16} />} onClick={() => void reportQuery.refetch()} loading={isLoading}>
            {t('common.refresh')}
          </Button>
          <ExportActions
            disabled={!data || data.groups.length === 0}
            formats={[
              {
                key: 'csv',
                label: 'CSV',
                icon: <FileTextOutlined />,
                onExport: handleExportCsv,
              },
              {
                key: 'pdf',
                label: 'PDF',
                icon: <FileTextOutlined />,
                onExport: handleExportPdf,
              },
            ]}
          />
        </Space>
      </div>

      {reportQuery.error ? (
        <Alert
          type="error"
          showIcon
          message={reportQuery.error instanceof Error ? reportQuery.error.message : t('common.unknownError')}
        />
      ) : null}

      {data && data.groups.length === 0 ? (
        <Empty description={t('cooperative.ledger.empty')} />
      ) : null}

      {data && data.groups.length > 0 ? (
        <div style={{ overflowX: 'auto' }}>
          <div style={reportWrapperStyle} data-testid="koperasi-ledger-report">
            <div style={reportHeaderStyle}>
              <div style={reportIdentityStyle}>
                <div style={reportLogoStyle}>
                  {profile?.logo_data_url ? (
                    <img
                      src={profile.logo_data_url}
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
                    {t('cooperative.ledger.subtitle')}
                  </div>
                </div>
              </div>
              <div style={reportMetaStyle}>
                <div>{t('cooperative.ledger.period')}: {periodText}</div>
                <div>{t('report.printDate')} {dayjs().tz().format('YYYY-MM-DD HH:mm:ss')}</div>
              </div>
            </div>

            {data.groups.map((group) => (
              <section key={group.account_id} style={accountSectionStyle}>
                <div style={accountHeaderStyle}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>
                      {t('generalLedger.account')}
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>
                      {group.account_code} - {group.account_name}
                    </div>
                  </div>
                  <div style={accountSummaryCellStyle}>
                    <div style={{ fontSize: 11 }}>{t('cooperative.ledger.openingBalance')}</div>
                    <div style={getSignedStyle(group.opening_balance)}>{money(group.opening_balance)}</div>
                  </div>
                  <div style={accountSummaryCellStyle}>
                    <div style={{ fontSize: 11 }}>{t('generalLedger.debit')}</div>
                    <div style={{ fontWeight: 600 }}>{money(group.total_debit)}</div>
                  </div>
                  <div style={accountSummaryCellStyle}>
                    <div style={{ fontSize: 11 }}>{t('generalLedger.credit')}</div>
                    <div style={{ fontWeight: 600 }}>{money(group.total_credit)}</div>
                  </div>
                  <div style={accountSummaryCellStyle}>
                    <div style={{ fontSize: 11 }}>{t('cooperative.ledger.endingBalance')}</div>
                    <div style={getSignedStyle(group.ending_balance)}>{money(group.ending_balance)}</div>
                  </div>
                </div>
                <table style={tableStyle}>
                  <colgroup>
                    {ledgerColumnWidths.map((style, index) => (
                      <col key={index} style={style} />
                    ))}
                  </colgroup>
                  <thead>
                    <tr>
                      <th style={thStyle}>{t('generalLedger.journal.date')}</th>
                      <th style={thStyle}>{t('generalLedger.journal.number')}</th>
                      <th style={thStyle}>{t('cooperative.reports.table.rowType')}</th>
                      <th style={thStyle}>{t('generalLedger.journal.source')}</th>
                      <th style={thStyle}>{t('generalLedger.journal.description')}</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>{t('generalLedger.debit')}</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>{t('generalLedger.credit')}</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>{t('generalLedger.ledger.runningBalance')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.rows.map((row) => (
                      <tr key={row.id}>
                        <td style={tdStyle}>{dateText(row.entry_date)}</td>
                        <td style={tdStyle}>{row.entry_number}</td>
                        <td style={tdStyle}>
                          <Tag color={row.row_type === 'MOVEMENT' ? 'blue' : 'default'}>
                            {getRowTypeLabel(row.row_type)}
                          </Tag>
                        </td>
                        <td style={tdStyle}>{row.source_number || '-'}</td>
                        <td style={tdStyle}>{row.row_type === 'MOVEMENT' ? row.description : getRowTypeLabel(row.row_type)}</td>
                        <td style={numberCellStyle}>{row.debit > 0 ? money(row.debit) : '-'}</td>
                        <td style={numberCellStyle}>{row.credit > 0 ? money(row.credit) : '-'}</td>
                        <td style={numberCellStyle}>
                          <span style={getSignedStyle(row.running_balance)}>{money(row.running_balance)}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            ))}
          </div>
        </div>
      ) : null}

      <Modal
        title={t('cooperative.ledger.filterTitle')}
        open={filterOpen}
        onCancel={() => setFilterOpen(false)}
        onOk={handleApplyFilter}
        okText={t('cooperative.ledger.applyFilter')}
        footer={[
          <Button key="reset" onClick={handleResetFilter}>
            {t('common.reset')}
          </Button>,
          <Button key="cancel" onClick={() => setFilterOpen(false)}>
            {t('common.cancel')}
          </Button>,
          <Button key="apply" type="primary" onClick={handleApplyFilter}>
            {t('cooperative.ledger.applyFilter')}
          </Button>,
        ]}
      >
        <Space direction="vertical" className="w-full" size="middle">
          <div>
            <Text strong>{t('cooperative.ledger.dateRange')}</Text>
            <DatePicker.RangePicker
              className="mt-2 w-full"
              value={dateRange}
              format="YYYY-MM-DD"
              onChange={(value) => {
                const fromDate = value?.[0];
                const toDate = value?.[1];

                if (!fromDate || !toDate) {
                  setDraftFilters((current) => ({ ...current, startDate: undefined, endDate: undefined }));
                  return;
                }
                setDraftFilters((current) => ({
                  ...current,
                  startDate: fromDate.startOf('day').toISOString(),
                  endDate: toDate.endOf('day').toISOString(),
                }));
              }}
            />
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Text strong>{t('cooperative.ledger.fromAccount')}</Text>
              <Select
                showSearch
                optionFilterProp="label"
                className="mt-2 w-full"
                value={draftFilters.fromAccountId ?? ALL_VALUE}
                options={accountOptions}
                onChange={(value) => setDraftFilters((current) => ({
                  ...current,
                  fromAccountId: value === ALL_VALUE ? undefined : value,
                }))}
              />
            </div>
            <div>
              <Text strong>{t('cooperative.ledger.toAccount')}</Text>
              <Select
                showSearch
                optionFilterProp="label"
                className="mt-2 w-full"
                value={draftFilters.toAccountId ?? ALL_VALUE}
                options={accountOptions}
                onChange={(value) => setDraftFilters((current) => ({
                  ...current,
                  toAccountId: value === ALL_VALUE ? undefined : value,
                }))}
              />
            </div>
          </div>
        </Space>
      </Modal>
    </div>
  );
}
