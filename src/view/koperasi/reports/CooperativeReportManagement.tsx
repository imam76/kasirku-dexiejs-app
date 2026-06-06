import { useMemo, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { Alert, Button, DatePicker, Descriptions, Select, Space, Statistic, Table, Tabs, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { Dayjs } from 'dayjs';
import { BookOpen, RefreshCw } from 'lucide-react';
import { useCooperativeReports } from '@/hooks/useCooperativeReports';
import { useI18n } from '@/hooks/useI18n';
import type { TranslationKey } from '@/i18n/messages';
import dayjs from '@/lib/dayjs';
import type {
  CooperativeLedgerRow,
  CooperativeOverdueReportRow,
} from '@/services/cooperativeReportService';
import type { JournalEntryWithLines } from '@/services/generalLedgerService';
import type {
  CooperativeLoanInstallmentStatus,
  JournalEntryLine,
  JournalEntryStatus,
  JournalSourceType,
} from '@/types';
import { formatCurrency, formatDate } from '@/utils/formatters';

const { Text, Title } = Typography;

const journalStatusColor: Record<JournalEntryStatus, string> = {
  DRAFT: 'default',
  POSTED: 'green',
  VOIDED: 'red',
  REVERSED: 'orange',
};

const installmentStatusColor: Record<CooperativeLoanInstallmentStatus, string> = {
  UNPAID: 'default',
  PARTIAL: 'blue',
  PAID: 'green',
  OVERDUE: 'red',
};

const installmentStatusLabelKey: Record<CooperativeLoanInstallmentStatus, TranslationKey> = {
  UNPAID: 'cooperative.loans.installmentStatus.unpaid',
  PARTIAL: 'cooperative.loans.installmentStatus.partial',
  PAID: 'cooperative.loans.installmentStatus.paid',
  OVERDUE: 'cooperative.loans.installmentStatus.overdue',
};

const getSignedAmountClass = (value: number) => (
  value < 0 ? 'text-red-600' : 'text-gray-900'
);

const money = (value: number) => `Rp ${formatCurrency(value || 0)}`;

const CooperativeSourceLink = ({
  sourceType,
  sourceEvent,
  sourceNumber,
}: {
  sourceType: JournalSourceType;
  sourceEvent?: string;
  sourceNumber?: string;
}) => {
  const label = sourceNumber || '-';
  const className = 'font-medium text-blue-600 hover:text-blue-700';

  if (sourceType === 'COOPERATIVE_SAVING') {
    return <Link to="/koperasi/simpanan" className={className}>{label}</Link>;
  }

  if (sourceEvent === 'COOPERATIVE_LOAN_PAYMENT_POSTED') {
    return <Link to="/koperasi/angsuran" className={className}>{label}</Link>;
  }

  return <Link to="/koperasi/pinjaman" className={className}>{label}</Link>;
};

export default function CooperativeReportManagement() {
  const { t } = useI18n();
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs] | null>(null);
  const [asOfDate, setAsOfDate] = useState<Dayjs | null>(() => dayjs.tz());
  const [accountFilter, setAccountFilter] = useState<string>();

  const filters = useMemo(() => ({
    startDate: dateRange?.[0].startOf('day').toISOString(),
    endDate: dateRange?.[1].endOf('day').toISOString(),
    asOfDate: asOfDate?.format('YYYY-MM-DD'),
    accountId: accountFilter,
  }), [accountFilter, asOfDate, dateRange]);

  const reportQuery = useCooperativeReports(filters);
  const data = reportQuery.data;
  const isLoading = reportQuery.isLoading || reportQuery.isFetching;
  const accounts = data?.accounts ?? [];
  const selectedAccount = data?.selectedAccount;
  const overdueSummary = data?.overdueReport.summary;
  const incomeStatement = data?.incomeStatement;
  const balanceSheet = data?.balanceSheet;

  const accountOptions = accounts.map((account) => ({
    value: account.id,
    label: `${account.code} - ${account.name}`,
  }));

  const journalLineColumns: ColumnsType<JournalEntryLine> = [
    {
      title: t('generalLedger.account'),
      key: 'account',
      render: (_value, record) => `${record.account_code} - ${record.account_name}`,
    },
    {
      title: t('generalLedger.debit'),
      dataIndex: 'debit',
      key: 'debit',
      align: 'right',
      render: (value: number) => value > 0 ? money(value) : '-',
      width: 160,
    },
    {
      title: t('generalLedger.credit'),
      dataIndex: 'credit',
      key: 'credit',
      align: 'right',
      render: (value: number) => value > 0 ? money(value) : '-',
      width: 160,
    },
    {
      title: t('generalLedger.journal.lineDescription'),
      dataIndex: 'description',
      key: 'description',
    },
  ];

  const journalColumns: ColumnsType<JournalEntryWithLines> = [
    {
      title: t('generalLedger.journal.date'),
      dataIndex: 'entry_date',
      key: 'entry_date',
      render: (value: string) => formatDate(value),
      width: 170,
    },
    {
      title: t('generalLedger.journal.number'),
      dataIndex: 'entry_number',
      key: 'entry_number',
      width: 170,
    },
    {
      title: t('generalLedger.journal.source'),
      key: 'source',
      render: (_value, record) => (
        <Space orientation="vertical" size={0}>
          <CooperativeSourceLink
            sourceType={record.source_type}
            sourceEvent={record.source_event}
            sourceNumber={record.source_number || record.source_id}
          />
          <Text type="secondary" className="text-xs">{record.source_type}</Text>
        </Space>
      ),
      width: 220,
    },
    {
      title: t('generalLedger.journal.description'),
      dataIndex: 'description',
      key: 'description',
    },
    {
      title: t('generalLedger.journal.status'),
      dataIndex: 'status',
      key: 'status',
      render: (status: JournalEntryStatus) => <Tag color={journalStatusColor[status]}>{status}</Tag>,
      width: 120,
    },
    {
      title: t('generalLedger.debit'),
      dataIndex: 'total_debit',
      key: 'total_debit',
      align: 'right',
      render: (value: number) => money(value),
      width: 160,
    },
    {
      title: t('generalLedger.credit'),
      dataIndex: 'total_credit',
      key: 'total_credit',
      align: 'right',
      render: (value: number) => money(value),
      width: 160,
    },
  ];

  const ledgerColumns: ColumnsType<CooperativeLedgerRow> = [
    {
      title: t('generalLedger.journal.date'),
      dataIndex: 'entry_date',
      key: 'entry_date',
      render: (value: string) => formatDate(value),
      width: 170,
    },
    {
      title: t('generalLedger.journal.number'),
      dataIndex: 'entry_number',
      key: 'entry_number',
      width: 170,
    },
    {
      title: t('generalLedger.journal.source'),
      key: 'source',
      render: (_value, record) => (
        <CooperativeSourceLink
          sourceType={record.source_type}
          sourceEvent={record.source_event}
          sourceNumber={record.source_number}
        />
      ),
      width: 180,
    },
    {
      title: t('generalLedger.journal.description'),
      dataIndex: 'description',
      key: 'description',
    },
    {
      title: t('generalLedger.debit'),
      dataIndex: 'debit',
      key: 'debit',
      align: 'right',
      render: (value: number) => value > 0 ? money(value) : '-',
      width: 150,
    },
    {
      title: t('generalLedger.credit'),
      dataIndex: 'credit',
      key: 'credit',
      align: 'right',
      render: (value: number) => value > 0 ? money(value) : '-',
      width: 150,
    },
    {
      title: t('generalLedger.ledger.runningBalance'),
      dataIndex: 'running_balance',
      key: 'running_balance',
      align: 'right',
      render: (value: number) => (
        <Text className={getSignedAmountClass(value)}>{money(value)}</Text>
      ),
      width: 190,
    },
  ];

  const overdueColumns: ColumnsType<CooperativeOverdueReportRow> = [
    {
      title: t('cooperative.installments.table.dueDate'),
      dataIndex: 'due_date',
      key: 'due_date',
      render: (value: string) => formatDate(value),
      width: 170,
    },
    {
      title: t('cooperative.installments.table.loan'),
      key: 'loan',
      render: (_value, record) => (
        <Space orientation="vertical" size={0}>
          <Link to="/koperasi/angsuran" className="font-medium text-blue-600 hover:text-blue-700">
            {record.loan_number}
          </Link>
          <Link to="/koperasi/anggota" className="text-gray-500 hover:text-blue-600">
            {record.member_number} - {record.member_name}
          </Link>
        </Space>
      ),
      width: 260,
    },
    {
      title: t('cooperative.installments.table.installmentNo'),
      dataIndex: 'installment_number',
      key: 'installment_number',
      align: 'right',
      width: 110,
    },
    {
      title: t('cooperative.reports.overdue.daysOverdue'),
      dataIndex: 'days_overdue',
      key: 'days_overdue',
      align: 'right',
      render: (value: number) => t('cooperative.reports.overdue.days', { days: value }),
      width: 140,
    },
    {
      title: t('cooperative.reports.overdue.principal'),
      dataIndex: 'remaining_principal_amount',
      key: 'remaining_principal_amount',
      align: 'right',
      render: (value: number) => money(value),
      width: 160,
    },
    {
      title: t('cooperative.reports.overdue.interest'),
      dataIndex: 'remaining_interest_amount',
      key: 'remaining_interest_amount',
      align: 'right',
      render: (value: number) => money(value),
      width: 160,
    },
    {
      title: t('cooperative.reports.overdue.penalty'),
      dataIndex: 'remaining_penalty_amount',
      key: 'remaining_penalty_amount',
      align: 'right',
      render: (value: number) => value > 0 ? money(value) : '-',
      width: 160,
    },
    {
      title: t('cooperative.reports.overdue.remainingTotal'),
      dataIndex: 'remaining_total_amount',
      key: 'remaining_total_amount',
      align: 'right',
      render: (value: number) => <Text strong>{money(value)}</Text>,
      width: 170,
    },
    {
      title: t('cooperative.installments.table.status'),
      dataIndex: 'status',
      key: 'status',
      render: (status: CooperativeLoanInstallmentStatus) => (
        <Tag color={installmentStatusColor[status]}>{t(installmentStatusLabelKey[status])}</Tag>
      ),
      width: 140,
    },
  ];

  return (
    <div className="p-3 sm:p-4 md:p-6 space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <Title level={2} className="!mb-1 flex items-center gap-2">
            <BookOpen size={24} />
            {t('cooperative.reports.title')}
          </Title>
          <Text type="secondary">{t('cooperative.reports.subtitle')}</Text>
        </div>
        <Space wrap>
          <DatePicker.RangePicker
            value={dateRange}
            onChange={(value) => setDateRange(value as [Dayjs, Dayjs] | null)}
          />
          <DatePicker
            value={asOfDate}
            onChange={(value) => setAsOfDate(value)}
            placeholder={t('cooperative.reports.asOfDate')}
          />
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder={t('generalLedger.filterAccount')}
            value={accountFilter}
            options={accountOptions}
            onChange={setAccountFilter}
            className="min-w-[260px]"
          />
          <Button icon={<RefreshCw size={16} />} onClick={() => void reportQuery.refetch()} loading={isLoading}>
            {t('common.refresh')}
          </Button>
        </Space>
      </div>

      {reportQuery.error && (
        <Alert
          type="error"
          showIcon
          message={reportQuery.error instanceof Error ? reportQuery.error.message : t('common.unknownError')}
        />
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <div className="rounded-lg border border-gray-100 bg-white p-4">
          <Statistic
            title={t('cooperative.reports.overdue.totalAmount')}
            value={overdueSummary?.total_amount ?? 0}
            prefix="Rp"
            formatter={(value) => formatCurrency(Number(value || 0))}
          />
        </div>
        <div className="rounded-lg border border-gray-100 bg-white p-4">
          <Statistic title={t('cooperative.reports.overdue.installmentCount')} value={overdueSummary?.row_count ?? 0} />
        </div>
        <div className="rounded-lg border border-gray-100 bg-white p-4">
          <Statistic title={t('cooperative.reports.overdue.loanCount')} value={overdueSummary?.loan_count ?? 0} />
        </div>
        <div className="rounded-lg border border-gray-100 bg-white p-4">
          <Statistic
            title={t('cooperative.reports.overdue.maxDays')}
            value={overdueSummary?.max_days_overdue ?? 0}
          />
        </div>
      </div>

      <Tabs
        items={[
          {
            key: 'overdue',
            label: t('cooperative.reports.tabs.overdue'),
            children: (
              <Table
                dataSource={data?.overdueReport.rows ?? []}
                columns={overdueColumns}
                rowKey="id"
                loading={isLoading}
                scroll={{ x: 1380 }}
                locale={{ emptyText: t('cooperative.reports.overdue.empty') }}
                summary={() => (
                  <Table.Summary.Row>
                    <Table.Summary.Cell index={0} colSpan={4}>
                      <Text strong>{t('common.total')}</Text>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={4} align="right">
                      <Text strong>{money(overdueSummary?.total_principal ?? 0)}</Text>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={5} align="right">
                      <Text strong>{money(overdueSummary?.total_interest ?? 0)}</Text>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={6} align="right">
                      <Text strong>{money(overdueSummary?.total_penalty ?? 0)}</Text>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={7} align="right">
                      <Text strong>{money(overdueSummary?.total_amount ?? 0)}</Text>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={8} />
                  </Table.Summary.Row>
                )}
              />
            ),
          },
          {
            key: 'journal',
            label: t('cooperative.reports.tabs.journal'),
            children: (
              <Table
                dataSource={data?.journalEntries ?? []}
                columns={journalColumns}
                rowKey="id"
                loading={isLoading}
                scroll={{ x: 980 }}
                expandable={{
                  expandedRowRender: (record) => (
                    <Table
                      dataSource={record.lines}
                      columns={journalLineColumns}
                      rowKey="id"
                      pagination={false}
                      size="small"
                    />
                  ),
                }}
              />
            ),
          },
          {
            key: 'ledger',
            label: t('cooperative.reports.tabs.ledger'),
            children: selectedAccount ? (
              <Table
                dataSource={data?.ledgerRows ?? []}
                columns={ledgerColumns}
                rowKey="id"
                loading={isLoading}
                scroll={{ x: 1080 }}
              />
            ) : (
              <Alert type="info" showIcon message={t('cooperative.reports.ledger.selectAccount')} />
            ),
          },
          {
            key: 'balance-sheet',
            label: t('cooperative.reports.tabs.balanceSheet'),
            children: (
              <div className="rounded-lg border border-gray-100 bg-white p-4">
                <Descriptions bordered column={1}>
                  <Descriptions.Item label={t('generalLedger.balance.assets')}>
                    {money(balanceSheet?.assets ?? 0)}
                  </Descriptions.Item>
                  <Descriptions.Item label={t('generalLedger.balance.liabilities')}>
                    {money(balanceSheet?.liabilities ?? 0)}
                  </Descriptions.Item>
                  <Descriptions.Item label={t('generalLedger.balance.equity')}>
                    {money(balanceSheet?.equity ?? 0)}
                  </Descriptions.Item>
                  <Descriptions.Item label={t('generalLedger.balance.currentIncome')}>
                    {money(balanceSheet?.current_period_income ?? 0)}
                  </Descriptions.Item>
                  <Descriptions.Item label={t('generalLedger.balance.totalLiabilitiesAndEquity')}>
                    {money(balanceSheet?.total_liabilities_and_equity ?? 0)}
                  </Descriptions.Item>
                  <Descriptions.Item label={t('generalLedger.balance.difference')}>
                    <Text strong className={getSignedAmountClass(balanceSheet?.difference ?? 0)}>
                      {money(balanceSheet?.difference ?? 0)}
                    </Text>
                  </Descriptions.Item>
                </Descriptions>
                {balanceSheet && !balanceSheet.is_balanced && (
                  <Alert className="mt-3" type="error" showIcon message={t('generalLedger.balanceNotBalanced')} />
                )}
              </div>
            ),
          },
          {
            key: 'income-statement',
            label: t('cooperative.reports.tabs.incomeStatement'),
            children: (
              <div className="rounded-lg border border-gray-100 bg-white p-4">
                <Descriptions bordered column={1}>
                  <Descriptions.Item label={t('generalLedger.income.revenue')}>
                    {money(incomeStatement?.revenue ?? 0)}
                  </Descriptions.Item>
                  <Descriptions.Item label={t('generalLedger.income.contraRevenue')}>
                    {money(incomeStatement?.contra_revenue ?? 0)}
                  </Descriptions.Item>
                  <Descriptions.Item label={t('generalLedger.income.netRevenue')}>
                    {money(incomeStatement?.net_revenue ?? 0)}
                  </Descriptions.Item>
                  <Descriptions.Item label={t('generalLedger.income.expense')}>
                    {money(incomeStatement?.expense ?? 0)}
                  </Descriptions.Item>
                  <Descriptions.Item label={t('generalLedger.income.netIncome')}>
                    <Text strong className={getSignedAmountClass(incomeStatement?.net_income ?? 0)}>
                      {money(incomeStatement?.net_income ?? 0)}
                    </Text>
                  </Descriptions.Item>
                </Descriptions>
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}
