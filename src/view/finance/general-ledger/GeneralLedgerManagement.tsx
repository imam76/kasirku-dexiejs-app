import { useMemo, useState } from 'react';
import { Alert, Button, Card, DatePicker, Descriptions, Select, Space, Table, Tabs, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { Dayjs } from 'dayjs';
import { useQuery } from '@tanstack/react-query';
import { useLiveQuery } from 'dexie-react-hooks';
import { BookOpen, FilePlus2, RefreshCw } from 'lucide-react';
import { db } from '@/lib/db';
import OpeningBalanceForm from '@/components/general-ledger/OpeningBalanceForm';
import ManualJournalForm from '@/components/general-ledger/ManualJournalForm';
import {
  getBalanceSheetReport,
  getIncomeStatementReport,
  getJournalEntriesWithLines,
  getTrialBalanceReport,
  type JournalEntryWithLines,
  type TrialBalanceRow,
} from '@/services/generalLedgerService';
import { hasPermission } from '@/auth/permissions';
import { useAuth } from '@/auth/useAuth';
import { useI18n } from '@/hooks/useI18n';
import { formatCurrency, formatDate } from '@/utils/formatters';
import type { JournalEntryLine, JournalEntryStatus } from '@/types';
import { getGeneralLedgerReadiness } from '@/utils/accounting/getGeneralLedgerReadiness';

const { Text, Title } = Typography;

const statusColor: Record<JournalEntryStatus, string> = {
  DRAFT: 'default',
  POSTED: 'green',
  VOIDED: 'red',
  REVERSED: 'orange',
};

const getSignedAmountClass = (value: number) => (
  value < 0 ? 'text-red-600' : 'text-gray-900'
);

interface LedgerRow {
  id: string;
  entry_date: string;
  entry_number: string;
  description: string;
  debit: number;
  credit: number;
  running_balance: number;
}

export default function GeneralLedgerManagement() {
  const { t } = useI18n();
  const { currentUser } = useAuth();
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs] | null>(null);
  const [accountFilter, setAccountFilter] = useState<string>();
  const [isManualJournalOpen, setIsManualJournalOpen] = useState(false);
  const generalLedgerModule = useLiveQuery(
    () => db.enabledModules.get('GENERAL_LEDGER'),
    [],
    undefined,
  );
  const generalLedgerSetting = useLiveQuery(
    () => db.generalLedgerSetting.get('default'),
    [],
    undefined,
  );
  const accounts = useLiveQuery(
    () => db.chartOfAccounts.orderBy('code').toArray(),
    [],
    [],
  );
  const readinessQuery = useQuery({
    queryKey: ['generalLedgerReadiness', generalLedgerSetting?.updated_at, accounts.length],
    queryFn: getGeneralLedgerReadiness,
  });
  const readiness = readinessQuery.data;
  const isLedgerReady = Boolean(readiness?.isReady);
  const isModuleEnabled = Boolean(generalLedgerModule?.is_enabled);
  const canShowReports = isModuleEnabled && isLedgerReady;
  const canManageManualJournal = canShowReports && hasPermission(currentUser?.role, 'JOURNAL_MANAGE');
  const filters = useMemo(() => ({
    startDate: dateRange?.[0].startOf('day').toISOString(),
    endDate: dateRange?.[1].endOf('day').toISOString(),
    accountId: accountFilter,
  }), [accountFilter, dateRange]);
  const reportKey = [filters.startDate, filters.endDate, filters.accountId];
  const journalQuery = useQuery({
    queryKey: ['journalEntries', ...reportKey],
    queryFn: () => getJournalEntriesWithLines({ ...filters, includeClosingEntries: true }),
    enabled: canShowReports,
  });
  const trialBalanceQuery = useQuery({
    queryKey: ['trialBalance', ...reportKey],
    queryFn: () => getTrialBalanceReport(filters),
    enabled: canShowReports,
  });
  const incomeStatementQuery = useQuery({
    queryKey: ['incomeStatement', ...reportKey],
    queryFn: () => getIncomeStatementReport(filters),
    enabled: canShowReports,
  });
  const balanceSheetQuery = useQuery({
    queryKey: ['balanceSheet', ...reportKey],
    queryFn: () => getBalanceSheetReport(filters),
    enabled: canShowReports,
  });
  const isLoading = journalQuery.isLoading ||
    trialBalanceQuery.isLoading ||
    incomeStatementQuery.isLoading ||
    balanceSheetQuery.isLoading;
  const refetchReports = () => {
    journalQuery.refetch();
    trialBalanceQuery.refetch();
    incomeStatementQuery.refetch();
    balanceSheetQuery.refetch();
  };
  const accountOptions = accounts
    .filter((account) => account.is_active)
    .map((account) => ({
      value: account.id,
      label: `${account.code} - ${account.name}`,
    }));
  const selectedAccount = accounts.find((account) => account.id === accountFilter);
  const ledgerRows = useMemo<LedgerRow[]>(() => {
    if (!selectedAccount) return [];

    let runningBalance = 0;
    return (journalQuery.data ?? [])
      .slice()
      .reverse()
      .flatMap((entry) => entry.lines.map((line) => ({ entry, line })))
      .filter(({ line }) => line.account_id === selectedAccount.id)
      .map(({ entry, line }) => {
        const movement = selectedAccount.normal_balance === 'DEBIT'
          ? line.debit - line.credit
          : line.credit - line.debit;
        runningBalance += movement;

        return {
          id: line.id,
          entry_date: entry.entry_date,
          entry_number: entry.entry_number,
          description: line.description || entry.description,
          debit: line.debit,
          credit: line.credit,
          running_balance: runningBalance,
        };
      });
  }, [journalQuery.data, selectedAccount]);

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
          <Text>{record.source_number || record.source_id || '-'}</Text>
          <Space size={4}>
            <Text type="secondary" className="text-xs">{record.source_type}</Text>
            {record.source_type === 'CLOSING_JOURNAL' && <Tag color="red">Closing</Tag>}
          </Space>
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
      render: (status: JournalEntryStatus) => <Tag color={statusColor[status]}>{status}</Tag>,
      width: 120,
    },
    {
      title: t('generalLedger.debit'),
      dataIndex: 'total_debit',
      key: 'total_debit',
      render: (value: number) => `Rp ${formatCurrency(value)}`,
      align: 'right',
      width: 160,
    },
    {
      title: t('generalLedger.credit'),
      dataIndex: 'total_credit',
      key: 'total_credit',
      render: (value: number) => `Rp ${formatCurrency(value)}`,
      align: 'right',
      width: 160,
    },
  ];

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
      render: (value: number) => value > 0 ? `Rp ${formatCurrency(value)}` : '-',
      width: 180,
    },
    {
      title: t('generalLedger.credit'),
      dataIndex: 'credit',
      key: 'credit',
      align: 'right',
      render: (value: number) => value > 0 ? `Rp ${formatCurrency(value)}` : '-',
      width: 180,
    },
    {
      title: t('generalLedger.journal.lineDescription'),
      dataIndex: 'description',
      key: 'description',
    },
  ];

  const trialBalanceColumns: ColumnsType<TrialBalanceRow> = [
    {
      title: t('generalLedger.account'),
      key: 'account',
      render: (_value, record) => `${record.account_code} - ${record.account_name}`,
    },
    {
      title: t('generalLedger.accountType'),
      dataIndex: 'account_type',
      key: 'account_type',
      width: 150,
    },
    {
      title: t('generalLedger.debit'),
      dataIndex: 'debit_balance',
      key: 'debit_balance',
      align: 'right',
      render: (value: number) => value > 0 ? `Rp ${formatCurrency(value)}` : '-',
      width: 180,
    },
    {
      title: t('generalLedger.credit'),
      dataIndex: 'credit_balance',
      key: 'credit_balance',
      align: 'right',
      render: (value: number) => value > 0 ? `Rp ${formatCurrency(value)}` : '-',
      width: 180,
    },
  ];

  const ledgerColumns: ColumnsType<LedgerRow> = [
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
      title: t('generalLedger.journal.description'),
      dataIndex: 'description',
      key: 'description',
    },
    {
      title: t('generalLedger.debit'),
      dataIndex: 'debit',
      key: 'debit',
      align: 'right',
      render: (value: number) => value > 0 ? `Rp ${formatCurrency(value)}` : '-',
      width: 160,
    },
    {
      title: t('generalLedger.credit'),
      dataIndex: 'credit',
      key: 'credit',
      align: 'right',
      render: (value: number) => value > 0 ? `Rp ${formatCurrency(value)}` : '-',
      width: 160,
    },
    {
      title: t('generalLedger.ledger.runningBalance'),
      dataIndex: 'running_balance',
      key: 'running_balance',
      align: 'right',
      render: (value: number) => (
        <Text className={getSignedAmountClass(value)}>Rp {formatCurrency(value)}</Text>
      ),
      width: 190,
    },
  ];

  const incomeStatement = incomeStatementQuery.data;
  const balanceSheet = balanceSheetQuery.data;
  const trialBalance = trialBalanceQuery.data;

  return (
    <div className="p-3 sm:p-4 md:p-6 space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <Title level={2} className="!mb-1 flex items-center gap-2">
            <BookOpen size={24} />
            {t('generalLedger.title')}
          </Title>
          <Text type="secondary">{t('generalLedger.subtitle')}</Text>
        </div>
        {canShowReports && (
          <Space wrap>
            {canManageManualJournal && (
              <Button
                type="primary"
                icon={<FilePlus2 size={16} />}
                onClick={() => setIsManualJournalOpen(true)}
              >
                {t('generalLedger.manual.add')}
              </Button>
            )}
            <DatePicker.RangePicker
              value={dateRange}
              onChange={(value) => setDateRange(value as [Dayjs, Dayjs] | null)}
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
            <Button icon={<RefreshCw size={16} />} onClick={refetchReports} loading={isLoading}>
              {t('common.refresh')}
            </Button>
          </Space>
        )}
      </div>

      <Card>
        <Descriptions size="small" column={{ xs: 1, sm: 2, lg: 4 }}>
          <Descriptions.Item label={t('generalLedger.cutoffDate')}>
            {generalLedgerSetting?.cutoff_date ? formatDate(generalLedgerSetting.cutoff_date) : '-'}
          </Descriptions.Item>
          <Descriptions.Item label={t('generalLedger.inventoryPolicy')}>
            {generalLedgerSetting?.inventory_policy
              ? generalLedgerSetting.inventory_policy === 'PERPETUAL_INVENTORY'
                ? t('generalLedger.inventoryPolicy.perpetual')
                : t('generalLedger.inventoryPolicy.cashFlowOnly')
              : '-'}
          </Descriptions.Item>
          <Descriptions.Item label={t('generalLedger.readiness')}>
            <Tag color={isLedgerReady ? 'green' : 'orange'}>
              {isLedgerReady ? t('generalLedger.ready') : t('generalLedger.notReady')}
            </Tag>
          </Descriptions.Item>
          <Descriptions.Item label={t('coa.modules.title')}>
            <Tag color={isModuleEnabled ? 'green' : 'default'}>
              {isModuleEnabled ? t('common.yes') : t('common.no')}
            </Tag>
          </Descriptions.Item>
        </Descriptions>
      </Card>

      {!isLedgerReady && readiness && (
        <Card>
          <Alert
            type="warning"
            showIcon
            title={t('generalLedger.notReadyTitle')}
            description={(
              <Space orientation="vertical" size={4}>
                {readiness.checks.map((check) => (
                  <Text key={check.key} type={check.passed ? 'secondary' : 'danger'}>
                    {check.passed ? 'OK' : '!'} {check.message}
                  </Text>
                ))}
              </Space>
            )}
          />
        </Card>
      )}

      {!isLedgerReady && (
        <OpeningBalanceForm
          accounts={accounts}
          setting={generalLedgerSetting}
          onPosted={() => void readinessQuery.refetch()}
        />
      )}

      {isLedgerReady && !isModuleEnabled && (
        <Alert
          type="warning"
          showIcon
          title={t('generalLedger.disabledTitle')}
          description={t('generalLedger.readyButDisabledDescription')}
        />
      )}

      {canShowReports && (
        <Alert
          type="info"
          showIcon
          title={t('generalLedger.reportCutoffWarning', {
            date: generalLedgerSetting?.cutoff_date?.slice(0, 10) ?? '-',
          })}
        />
      )}

      {canShowReports && (
        <Tabs
          items={[
            {
              key: 'journal',
              label: t('generalLedger.tabs.journal'),
              children: (
                <Card>
                  <Table
                    dataSource={journalQuery.data ?? []}
                    columns={journalColumns}
                    rowKey="id"
                    loading={journalQuery.isLoading}
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
                </Card>
              ),
            },
            {
              key: 'ledger',
              label: t('generalLedger.tabs.ledger'),
              children: (
                <Card>
                  {selectedAccount ? (
                    <Table
                      dataSource={ledgerRows}
                      columns={ledgerColumns}
                      rowKey="id"
                      loading={journalQuery.isLoading}
                      scroll={{ x: 850 }}
                    />
                  ) : (
                    <Alert type="info" showIcon title={t('generalLedger.ledger.selectAccount')} />
                  )}
                </Card>
              ),
            },
            {
              key: 'trial-balance',
              label: t('generalLedger.tabs.trialBalance'),
              children: (
                <Card>
                  <Table
                    dataSource={trialBalance?.rows ?? []}
                    columns={trialBalanceColumns}
                    rowKey="account_id"
                    loading={trialBalanceQuery.isLoading}
                    scroll={{ x: 760 }}
                    summary={() => (
                      <Table.Summary.Row>
                        <Table.Summary.Cell index={0} colSpan={2}>
                          <Text strong>{t('common.total')}</Text>
                        </Table.Summary.Cell>
                        <Table.Summary.Cell index={2} align="right">
                          <Text strong>Rp {formatCurrency(trialBalance?.total_debit ?? 0)}</Text>
                        </Table.Summary.Cell>
                        <Table.Summary.Cell index={3} align="right">
                          <Text strong>Rp {formatCurrency(trialBalance?.total_credit ?? 0)}</Text>
                        </Table.Summary.Cell>
                      </Table.Summary.Row>
                    )}
                  />
                  {trialBalance && !trialBalance.is_balanced && (
                    <Alert className="mt-3" type="error" showIcon title={t('generalLedger.trialBalanceNotBalanced')} />
                  )}
                </Card>
              ),
            },
            {
              key: 'income-statement',
              label: t('generalLedger.tabs.incomeStatement'),
              children: (
                <Card loading={incomeStatementQuery.isLoading}>
                  <Descriptions bordered column={1}>
                    <Descriptions.Item label={t('generalLedger.income.revenue')}>
                      Rp {formatCurrency(incomeStatement?.revenue ?? 0)}
                    </Descriptions.Item>
                    <Descriptions.Item label={t('generalLedger.income.contraRevenue')}>
                      Rp {formatCurrency(incomeStatement?.contra_revenue ?? 0)}
                    </Descriptions.Item>
                    <Descriptions.Item label={t('generalLedger.income.netRevenue')}>
                      Rp {formatCurrency(incomeStatement?.net_revenue ?? 0)}
                    </Descriptions.Item>
                    <Descriptions.Item label={t('generalLedger.income.expense')}>
                      Rp {formatCurrency(incomeStatement?.expense ?? 0)}
                    </Descriptions.Item>
                    <Descriptions.Item label={t('generalLedger.income.netIncome')}>
                      <Text strong className={getSignedAmountClass(incomeStatement?.net_income ?? 0)}>
                        Rp {formatCurrency(incomeStatement?.net_income ?? 0)}
                      </Text>
                    </Descriptions.Item>
                  </Descriptions>
                </Card>
              ),
            },
            {
              key: 'balance-sheet',
              label: t('generalLedger.tabs.balanceSheet'),
              children: (
                <Card loading={balanceSheetQuery.isLoading}>
                <Descriptions bordered column={1}>
                  <Descriptions.Item label={t('generalLedger.balance.assets')}>
                    Rp {formatCurrency(balanceSheet?.assets ?? 0)}
                  </Descriptions.Item>
                  <Descriptions.Item label={t('generalLedger.balance.liabilities')}>
                    Rp {formatCurrency(balanceSheet?.liabilities ?? 0)}
                  </Descriptions.Item>
                  <Descriptions.Item label={t('generalLedger.balance.equity')}>
                    Rp {formatCurrency(balanceSheet?.equity ?? 0)}
                  </Descriptions.Item>
                  <Descriptions.Item label={t('generalLedger.balance.currentIncome')}>
                    Rp {formatCurrency(balanceSheet?.current_period_income ?? 0)}
                  </Descriptions.Item>
                  <Descriptions.Item label={t('generalLedger.balance.totalLiabilitiesAndEquity')}>
                    Rp {formatCurrency(balanceSheet?.total_liabilities_and_equity ?? 0)}
                  </Descriptions.Item>
                  <Descriptions.Item label={t('generalLedger.balance.difference')}>
                    <Text strong className={getSignedAmountClass(balanceSheet?.difference ?? 0)}>
                      Rp {formatCurrency(balanceSheet?.difference ?? 0)}
                    </Text>
                  </Descriptions.Item>
                </Descriptions>
                {balanceSheet && !balanceSheet.is_balanced && (
                  <Alert className="mt-3" type="error" showIcon title={t('generalLedger.balanceNotBalanced')} />
                )}
              </Card>
            ),
          },
        ]}
        />
      )}

      <ManualJournalForm
        open={isManualJournalOpen}
        accounts={accounts}
        onCancel={() => setIsManualJournalOpen(false)}
        onPosted={refetchReports}
      />
    </div>
  );
}
