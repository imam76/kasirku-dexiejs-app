import { useCallback, useMemo, useState } from 'react';
import { Alert, App, Button, Card, DatePicker, Select, Space, Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { FileExcelOutlined, FilePdfOutlined, ReloadOutlined } from '@ant-design/icons';
import type { Dayjs } from 'dayjs';
import autoTable from 'jspdf-autotable';
import { useLiveQuery } from 'dexie-react-hooks';
import { useQuery } from '@tanstack/react-query';
import CompanyReportHeader from '@/components/report/CompanyReportHeader';
import ExportActions from '@/components/ExportActions';
import { Loading } from '@/components/Loading';
import { getCurrentSessionUser, requireUserPermission } from '@/auth/authService';
import { useBaseCurrency } from '@/hooks/useBaseCurrency';
import { useI18n } from '@/hooks/useI18n';
import { useIsMobile } from '@/hooks/useIsMobile';
import dayjs from '@/lib/dayjs';
import { db } from '@/lib/db';
import {
  getBalanceSheetReport,
  type BalanceSheetReport as BalanceSheetReportData,
  type BalanceSheetSectionKey,
  type BalanceSheetTreeRow,
  type GeneralLedgerReportFilters,
} from '@/services/generalLedgerService';
import { getGeneralLedgerReadiness } from '@/utils/accounting/getGeneralLedgerReadiness';
import { exportPdf, exportXlsx, type ExportTarget } from '@/utils/export';
import { formatCurrency } from '@/utils/formatters';

const { Text, Title } = Typography;

interface ReportTableRow extends BalanceSheetTreeRow {
  key: string;
  children?: ReportTableRow[];
}

interface PrintableBalanceSheetRow {
  key: string;
  code: string;
  label: string;
  amount: number;
  level: number;
  rowType: BalanceSheetTreeRow['row_type'];
}

const emptyBalanceSheet: BalanceSheetReportData = {
  assets: 0,
  liabilities: 0,
  equity: 0,
  current_period_income: 0,
  total_liabilities_and_equity: 0,
  difference: 0,
  is_balanced: true,
  sections: [],
};

const getSignedAmountClass = (value: number) => (
  value < 0 ? 'text-red-600' : 'text-gray-900'
);

const mapTreeRow = (row: BalanceSheetTreeRow): ReportTableRow => ({
  ...row,
  key: row.id,
  children: row.children?.map(mapTreeRow),
});

export default function BalanceSheetReport() {
  const { message } = App.useApp();
  const { t } = useI18n();
  const isMobile = useIsMobile();
  const { baseCurrencyCode, baseCurrencySymbol } = useBaseCurrency();
  const [asOfDate, setAsOfDate] = useState<string>(dayjs.tz().format('YYYY-MM-DD'));
  const [selectedHelper, setSelectedHelper] = useState<string>('today');
  const [currencyFilter, setCurrencyFilter] = useState<string>();
  const [contactFilter, setContactFilter] = useState<string>();
  const [departmentFilter, setDepartmentFilter] = useState<string>();

  const generalLedgerModule = useLiveQuery(
    () => db.enabledModules.get('GENERAL_LEDGER'),
    [],
    undefined,
  );
  const accounts = useLiveQuery(
    () => db.chartOfAccounts.orderBy('code').toArray(),
    [],
    [],
  );
  const currencies = useLiveQuery(
    () => db.currencies.orderBy('code').toArray(),
    [],
    [],
  );
  const contacts = useLiveQuery(
    () => db.contacts.orderBy('name').toArray(),
    [],
    [],
  );
  const departments = useLiveQuery(
    () => db.departments.orderBy('name').toArray(),
    [],
    [],
  );
  const readinessQuery = useQuery({
    queryKey: ['generalLedgerReadinessForBalanceSheet', generalLedgerModule?.updated_at, accounts.length],
    queryFn: getGeneralLedgerReadiness,
  });
  const readiness = readinessQuery.data;
  const isModuleEnabled = Boolean(generalLedgerModule?.is_enabled);
  const isLedgerReady = Boolean(readiness?.isReady);
  const isLedgerAvailable = Boolean(readiness?.isAvailable);
  const canShowReport = isModuleEnabled && isLedgerAvailable;
  const failedAvailabilityChecks = readiness?.availabilityChecks.filter((check) => !check.passed) ?? [];
  const failedProductionChecks = readiness?.checks.filter((check) => !check.passed) ?? [];
  const filters = useMemo<GeneralLedgerReportFilters>(() => ({
    endDate: asOfDate ? dayjs.tz(asOfDate).endOf('day').toISOString() : undefined,
    currencyCode: currencyFilter,
    contactId: contactFilter,
    departmentId: departmentFilter,
  }), [asOfDate, contactFilter, currencyFilter, departmentFilter]);
  const reportQuery = useQuery({
    queryKey: [
      'balanceSheetReport',
      filters.endDate,
      filters.currencyCode,
      filters.contactId,
      filters.departmentId,
    ],
    queryFn: async () => {
      await requireUserPermission(await getCurrentSessionUser(), 'REPORT_BALANCE_SHEET_VIEW');
      return getBalanceSheetReport(filters);
    },
    enabled: canShowReport,
  });
  const report = reportQuery.data ?? emptyBalanceSheet;
  const sectionLabels = useMemo<Record<BalanceSheetSectionKey, string>>(() => ({
    ASSET: t('report.balanceSheet.assets'),
    LIABILITY: t('report.balanceSheet.liabilities'),
    EQUITY: t('report.balanceSheet.equity'),
  }), [t]);
  const getRowLabel = useCallback((row: BalanceSheetTreeRow) => (
    row.row_type === 'current_income' ? t('report.balanceSheet.currentIncome') : row.account_name
  ), [t]);
  const tableRows = useMemo<ReportTableRow[]>(() => (
    report.sections.map((section) => ({
      id: `section-${section.key}`,
      key: `section-${section.key}`,
      row_type: 'section',
      account_name: sectionLabels[section.key],
      amount: section.total,
      level: 0,
      children: section.rows.map(mapTreeRow),
    }))
  ), [report, sectionLabels]);
  const printableRows = useMemo<PrintableBalanceSheetRow[]>(() => {
    const flattenRows = (rows: ReportTableRow[], level = 0): PrintableBalanceSheetRow[] => rows.flatMap((row) => [
      {
        key: row.key,
        code: row.account_code ?? '',
        label: getRowLabel(row),
        amount: row.amount,
        level,
        rowType: row.row_type,
      },
      ...flattenRows(row.children ?? [], level + 1),
    ]);

    return flattenRows(tableRows);
  }, [getRowLabel, tableRows]);
  const selectedCurrency = currencies.find((currency) => currency.code === currencyFilter);
  const selectedContact = contacts.find((contact) => contact.id === contactFilter);
  const selectedDepartment = departments.find((department) => department.id === departmentFilter);
  const currencyOptions = [
    ...(currencies.some((currency) => currency.code === baseCurrencyCode)
      ? []
      : [{ value: baseCurrencyCode, label: baseCurrencyCode }]),
    ...currencies
      .filter((currency) => currency.is_active)
      .map((currency) => ({
        value: currency.code,
        label: `${currency.code} - ${currency.name}`,
      })),
  ];
  const contactOptions = contacts
    .filter((contact) => contact.is_active)
    .map((contact) => ({
      value: contact.id,
      label: contact.company_name ? `${contact.name} - ${contact.company_name}` : contact.name,
    }));
  const departmentOptions = departments
    .filter((department) => department.is_active)
    .map((department) => ({
      value: department.id,
      label: department.code ? `${department.code} - ${department.name}` : department.name,
    }));
  const asOfText = asOfDate || t('report.allPeriod');
  const money = (value: number) => `${baseCurrencySymbol} ${formatCurrency(value)}`;

  const handleDateChange = (value: Dayjs | null) => {
    setSelectedHelper('custom');
    setAsOfDate(value ? value.format('YYYY-MM-DD') : '');
  };

  const handleHelperChange = (value: string) => {
    setSelectedHelper(value);
    if (value === 'today') {
      setAsOfDate(dayjs.tz().format('YYYY-MM-DD'));
    } else if (value === 'end-this-month') {
      setAsOfDate(dayjs.tz().endOf('month').format('YYYY-MM-DD'));
    } else if (value === 'end-last-month') {
      setAsOfDate(dayjs.tz().subtract(1, 'month').endOf('month').format('YYYY-MM-DD'));
    }
  };

  const handleReset = () => {
    setSelectedHelper('today');
    setAsOfDate(dayjs.tz().format('YYYY-MM-DD'));
    setCurrencyFilter(undefined);
    setContactFilter(undefined);
    setDepartmentFilter(undefined);
  };

  const handleExportPDF = async (target: ExportTarget = 'auto') => {
    if (!reportQuery.data) return;

    try {
      const exported = await exportPdf({
        filename: `laporan-neraca-${dayjs().tz().format('YYYY-MM-DD')}.pdf`,
        target,
        build: (doc) => {
          doc.setFontSize(18);
          doc.text(t('report.balanceSheet.title'), 14, 22);
          doc.setFontSize(11);
          doc.text(`${t('report.balanceSheet.asOfWithColon')} ${asOfText}`, 14, 30);
          doc.text(`${t('report.printDate')} ${dayjs().tz().format('YYYY-MM-DD HH:mm:ss')}`, 14, 38);
          autoTable(doc, {
            startY: 46,
            head: [[t('generalLedger.account'), t('report.description'), baseCurrencySymbol, t('report.amount')]],
            body: printableRows.map((row) => [
              row.code,
              `${'  '.repeat(row.level)}${row.label}`,
              baseCurrencySymbol,
              formatCurrency(row.amount),
            ]),
            theme: 'grid',
            headStyles: { fillColor: [41, 128, 185], textColor: 255 },
            columnStyles: {
              0: { cellWidth: 35 },
              2: { cellWidth: 20, halign: 'center' },
              3: { halign: 'right' },
            },
            didParseCell: (data) => {
              const row = printableRows[data.row.index];
              if (data.section === 'body' && row?.rowType === 'section') {
                data.cell.styles.fontStyle = 'bold';
                data.cell.styles.textColor = [0, 114, 188];
              }
            },
          });
        },
      });

      if (!exported) return;
      message.success(t('report.balanceSheet.exportPdfSuccess'));
    } catch (error) {
      console.error('Failed to export balance sheet PDF:', error);
      message.error(t('report.balanceSheet.exportPdfFailed'));
    }
  };

  const handleExportExcel = async (target: ExportTarget = 'auto') => {
    if (!reportQuery.data) return;

    try {
      const rows = [
        [t('report.balanceSheet.title')],
        [`${t('report.balanceSheet.asOfWithColon')} ${asOfText}`],
        [`${t('report.printDate')} ${dayjs().tz().format('YYYY-MM-DD HH:mm:ss')}`],
        [t('report.balanceSheet.currency'), selectedCurrency?.code ?? t('report.balanceSheet.allCurrencies')],
        [t('report.balanceSheet.contact'), selectedContact?.name ?? t('report.balanceSheet.allContacts')],
        [t('report.balanceSheet.department'), selectedDepartment?.name ?? t('report.balanceSheet.allDepartments')],
        [],
        [t('generalLedger.account'), t('report.description'), baseCurrencySymbol, t('report.amount')],
        ...printableRows.map((row) => [
          row.code,
          `${'  '.repeat(row.level)}${row.label}`,
          baseCurrencySymbol,
          row.amount,
        ]),
      ];
      const exported = await exportXlsx({
        filename: `laporan-neraca-${dayjs().tz().format('YYYY-MM-DD')}.xlsx`,
        target,
        sheets: [
          {
            name: t('report.balanceSheet.title'),
            rows,
          },
        ],
      });

      if (!exported) return;
      message.success(t('report.balanceSheet.exportExcelSuccess'));
    } catch (error) {
      console.error('Failed to export balance sheet Excel:', error);
      message.error(t('report.balanceSheet.exportExcelFailed'));
    }
  };

  const columns: ColumnsType<ReportTableRow> = [
    {
      title: t('generalLedger.account'),
      dataIndex: 'account_code',
      key: 'account_code',
      width: 160,
      render: (value: string | undefined, record) => (
        <Text className={record.row_type === 'section' ? 'font-semibold text-[#0072bc]' : 'font-medium text-[#00a6c8]'}>
          {value || ''}
        </Text>
      ),
    },
    {
      title: t('report.description'),
      key: 'description',
      render: (_value, record) => (
        <Text className={record.row_type === 'section' ? 'font-semibold text-[#0072bc]' : record.row_type === 'current_income' ? 'font-semibold text-gray-900' : 'text-gray-900'}>
          {getRowLabel(record)}
        </Text>
      ),
    },
    {
      title: baseCurrencySymbol,
      key: 'currency',
      width: 80,
      align: 'center',
      render: () => <Text type="secondary">{baseCurrencySymbol}</Text>,
    },
    {
      title: t('report.amount'),
      dataIndex: 'amount',
      key: 'amount',
      align: 'right',
      width: 190,
      render: (value: number, record) => (
        <Text strong={record.row_type === 'section'} className={getSignedAmountClass(value)}>
          {formatCurrency(value)}
        </Text>
      ),
    },
  ];

  const isLoading = readinessQuery.isLoading || (canShowReport && reportQuery.isLoading);
  if (isLoading) return <Loading />;

  return (
    <div className="min-h-screen bg-[#FDFDFD] p-4 sm:p-6">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Title level={4} className="!mb-1 !font-bold text-gray-900">{t('report.balanceSheet.title')}</Title>
          <p className="text-xs text-gray-500 sm:text-sm">{t('report.balanceSheet.subtitle')}</p>
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <Button
            className="flex-1 items-center justify-center gap-1.5 sm:flex-none"
            icon={<ReloadOutlined className="text-[12px]" />}
            onClick={() => reportQuery.refetch()}
            loading={reportQuery.isFetching}
            disabled={!canShowReport}
          >
            {t('common.refresh')}
          </Button>
          <ExportActions
            buttonClassName="flex-1 sm:flex-none flex items-center justify-center gap-1.5 bg-[#2563EB] hover:bg-[#1D4ED8] border-none shadow-sm"
            disabled={!canShowReport || !reportQuery.data}
            formats={[
              {
                key: 'pdf',
                label: 'PDF',
                icon: <FilePdfOutlined className="text-[12px]" />,
                onExport: handleExportPDF,
              },
              {
                key: 'excel',
                label: 'Excel',
                icon: <FileExcelOutlined className="text-[12px]" />,
                onExport: handleExportExcel,
              },
            ]}
          />
        </div>
      </div>

      <div className="mb-6">
        <CompanyReportHeader
          reportTitle={t('report.balanceSheet.title')}
          reportDescription={t('report.balanceSheet.subtitle')}
        />
      </div>

      <div className="mb-8 rounded-lg border border-gray-100 bg-white p-5 shadow-sm">
        <div className="mb-4 text-[11px] font-bold uppercase tracking-[0.1em] text-gray-400">{t('report.parameterTitle')}</div>
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="flex flex-col gap-2.5">
            <span className="ml-0.5 text-[13px] font-medium text-gray-700">{t('report.balanceSheet.asOfDate')}</span>
            <div className="flex flex-wrap gap-2">
              {[
                ['today', t('report.today')],
                ['end-this-month', t('report.balanceSheet.endThisMonth')],
                ['end-last-month', t('report.balanceSheet.endLastMonth')],
              ].map(([key, label]) => (
                <Button
                  key={key}
                  size={isMobile ? 'small' : 'middle'}
                  className={`rounded-full px-4 text-[12px] font-medium transition-all ${selectedHelper === key ? 'bg-[#2563EB] text-white border-[#2563EB]' : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-[#2563EB]'}`}
                  onClick={() => handleHelperChange(key)}
                >
                  {label}
                </Button>
              ))}
            </div>
            <DatePicker
              value={asOfDate ? dayjs.tz(asOfDate) : null}
              onChange={handleDateChange}
              className="w-full"
              size="large"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <span className="ml-0.5 text-[13px] font-medium text-gray-700">{t('report.balanceSheet.currency')}</span>
              <Select
                placeholder={t('report.balanceSheet.allCurrencies')}
                className="w-full"
                value={currencyFilter}
                onChange={setCurrencyFilter}
                allowClear
                showSearch
                options={currencyOptions}
                optionFilterProp="label"
                size="large"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="ml-0.5 text-[13px] font-medium text-gray-700">{t('report.balanceSheet.contact')}</span>
              <Select
                placeholder={t('report.balanceSheet.allContacts')}
                className="w-full"
                value={contactFilter}
                onChange={setContactFilter}
                allowClear
                showSearch
                options={contactOptions}
                optionFilterProp="label"
                size="large"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="ml-0.5 text-[13px] font-medium text-gray-700">{t('report.balanceSheet.department')}</span>
              <Select
                placeholder={t('report.balanceSheet.allDepartments')}
                className="w-full"
                value={departmentFilter}
                onChange={setDepartmentFilter}
                allowClear
                showSearch
                options={departmentOptions}
                optionFilterProp="label"
                size="large"
              />
            </div>
          </div>

          <div className="flex justify-end lg:col-span-2">
            <Button onClick={handleReset}>{t('common.reset')}</Button>
          </div>
        </div>
      </div>

      {!canShowReport ? (
        <Alert
          type="warning"
          showIcon
          message={isModuleEnabled ? t('report.financial.notAvailableTitle') : t('report.balanceSheet.moduleDisabledTitle')}
          description={isModuleEnabled ? (
            <Space direction="vertical" size={4}>
              {(failedAvailabilityChecks.length
                ? failedAvailabilityChecks.map((check) => check.message)
                : [t('report.financial.notAvailableMessage')]
              ).map((item) => (
                <Text key={item}>{item}</Text>
              ))}
            </Space>
          ) : t('report.balanceSheet.moduleDisabledMessage')}
        />
      ) : reportQuery.error ? (
        <Alert
          type="error"
          showIcon
          message={t('report.withDateError', {
            message: reportQuery.error instanceof Error ? reportQuery.error.message : t('common.unknownError'),
          })}
        />
      ) : (
        <Space direction="vertical" size="middle" className="w-full">
          {!isLedgerReady && readiness ? (
            <Alert
              type="warning"
              showIcon
              message={t('report.financial.partialBaselineTitle')}
              description={(
                <Space direction="vertical" size={4}>
                  <Text>{t('report.financial.partialBaselineMessage')}</Text>
                  {failedProductionChecks.map((check) => (
                    <Text key={check.key} type="secondary">{check.message}</Text>
                  ))}
                </Space>
              )}
            />
          ) : null}
          <Card className="shadow-sm">
          <Space direction="vertical" size="large" className="w-full">
            <div className="flex flex-col gap-1 border-b border-gray-100 pb-4">
              <Text type="secondary">{t('report.balanceSheet.asOfWithColon')} {asOfText}</Text>
              <Text type="secondary">
                {selectedDepartment?.name ?? t('report.balanceSheet.allDepartments')}
                {' '}· {selectedCurrency?.code ?? t('report.balanceSheet.allCurrencies')}
                {' '}· {selectedContact?.name ?? t('report.balanceSheet.allContacts')}
              </Text>
            </div>

            <Table
              dataSource={tableRows}
              columns={columns}
              rowKey="key"
              pagination={false}
              loading={reportQuery.isFetching}
              scroll={{ x: 760 }}
              expandable={{ defaultExpandAllRows: true }}
              summary={() => (
                <>
                  <Table.Summary.Row>
                    <Table.Summary.Cell index={0} colSpan={3}>
                      <Text strong>{t('report.balanceSheet.totalAssets')}</Text>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={3} align="right">
                      <Text strong className={getSignedAmountClass(report.assets)}>{money(report.assets)}</Text>
                    </Table.Summary.Cell>
                  </Table.Summary.Row>
                  <Table.Summary.Row>
                    <Table.Summary.Cell index={0} colSpan={3}>
                      <Text strong>{t('report.balanceSheet.totalLiabilitiesAndEquity')}</Text>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={3} align="right">
                      <Text strong className={getSignedAmountClass(report.total_liabilities_and_equity)}>
                        {money(report.total_liabilities_and_equity)}
                      </Text>
                    </Table.Summary.Cell>
                  </Table.Summary.Row>
                  <Table.Summary.Row>
                    <Table.Summary.Cell index={0} colSpan={3}>
                      <Text strong>{t('generalLedger.balance.difference')}</Text>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={3} align="right">
                      <Text strong className={getSignedAmountClass(report.difference)}>{money(report.difference)}</Text>
                    </Table.Summary.Cell>
                  </Table.Summary.Row>
                </>
              )}
            />

            {!report.is_balanced && (
              <Alert type="error" showIcon message={t('generalLedger.balanceNotBalanced')} />
            )}
          </Space>
          </Card>
        </Space>
      )}
    </div>
  );
}
