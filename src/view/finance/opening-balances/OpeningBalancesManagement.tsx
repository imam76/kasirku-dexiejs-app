import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { App, Alert, Button, Card, DatePicker, Descriptions, Input, InputNumber, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, CheckCircle2, CircleSlash, FilePlus2, Landmark, Plus, Trash2 } from 'lucide-react';
import dayjs from '@/lib/dayjs';
import { db } from '@/lib/db';
import OpeningBalanceForm from '@/components/general-ledger/OpeningBalanceForm';
import { useAccountingSetupStatus } from '@/hooks/useAccountingSetupStatus';
import { useBaseCurrency } from '@/hooks/useBaseCurrency';
import { useI18n } from '@/hooks/useI18n';
import {
  OPENING_BALANCE_MODULE_DEFINITIONS,
  getOpeningBalanceBatchId,
  getOpeningBalanceModuleDefinition,
  markOpeningBalanceModuleSkipped,
  postOpeningBalanceDetailBatch,
  type OpeningBalanceSourceLineInput,
} from '@/services/openingBalanceService';
import { formatCurrency, formatDateOnly } from '@/utils/formatters';
import type {
  GeneralLedgerSetting,
  OpeningBalanceBatch,
  OpeningBalanceBatchStatus,
  OpeningBalanceLine,
  OpeningBalanceModule,
} from '@/types';

const { Text, Title } = Typography;

type StatusView = OpeningBalanceBatchStatus | 'EMPTY';

interface EditableSourceLine {
  id: string;
  party_name?: string;
  document_number?: string;
  document_date?: string;
  due_date?: string;
  amount?: number;
  notes?: string;
}

const statusColor: Record<StatusView, string> = {
  EMPTY: 'default',
  DRAFT: 'blue',
  POSTED: 'green',
  SKIPPED: 'gold',
  VOIDED: 'red',
};

const statusKey: Record<StatusView, string> = {
  EMPTY: 'openingBalances.status.empty',
  DRAFT: 'openingBalances.status.draft',
  POSTED: 'openingBalances.status.posted',
  SKIPPED: 'openingBalances.status.skipped',
  VOIDED: 'openingBalances.status.voided',
};

const createEditableLine = (cutoffDate?: string): EditableSourceLine => ({
  id: crypto.randomUUID(),
  document_date: cutoffDate,
  due_date: cutoffDate,
  amount: 0,
});

const getBatchStatus = (batch?: OpeningBalanceBatch): StatusView => batch?.status ?? 'EMPTY';

const getBatchForModule = (
  batches: OpeningBalanceBatch[],
  module: OpeningBalanceModule,
  cutoffDate?: string,
) => {
  if (!cutoffDate) return undefined;
  const batchId = getOpeningBalanceBatchId(module, cutoffDate);
  return batches.find((batch) => batch.id === batchId);
};

const StatusTag = ({ status }: { status: StatusView }) => {
  const { t } = useI18n();
  return <Tag color={statusColor[status]}>{t(statusKey[status] as never)}</Tag>;
};

const moneyFactory = (symbol: string) => (value?: number) => (
  `${symbol} ${formatCurrency(Number(value || 0))}`
);

export default function OpeningBalancesManagement() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { baseCurrencyCode, baseCurrencySymbol } = useBaseCurrency();
  const openingBalanceState = useLiveQuery(
    async () => {
      const [batches, setup, setting] = await Promise.all([
        db.openingBalanceBatches.toArray(),
        db.accountingInitialSetupSetting.get('default'),
        db.generalLedgerSetting.get('default'),
      ]);

      return { batches, setup, setting };
    },
    [],
    { batches: [], setup: undefined, setting: undefined },
  );
  const cutoffDate = openingBalanceState.setup?.cutoff_date ?? openingBalanceState.setting?.cutoff_date;
  const currentPeriod = openingBalanceState.setup
    ? `${formatDateOnly(openingBalanceState.setup.current_period_start)} - ${formatDateOnly(openingBalanceState.setup.current_period_end)}`
    : '-';
  const money = moneyFactory(baseCurrencySymbol);
  const rows = OPENING_BALANCE_MODULE_DEFINITIONS.map((definition) => {
    const batch = getBatchForModule(openingBalanceState.batches, definition.module, cutoffDate);
    return {
      ...definition,
      batch,
      status: getBatchStatus(batch),
    };
  });
  const postedBatches = rows
    .map((row) => row.batch)
    .filter((batch): batch is OpeningBalanceBatch => Boolean(batch && batch.status === 'POSTED'));
  const totalDebit = postedBatches.reduce((sum, batch) => sum + Number(batch.total_debit || 0), 0);
  const totalCredit = postedBatches.reduce((sum, batch) => sum + Number(batch.total_credit || 0), 0);

  const columns: ColumnsType<(typeof rows)[number]> = [
    {
      title: t('openingBalances.module'),
      key: 'module',
      render: (_value, record) => (
        <Space orientation="vertical" size={0}>
          <Text strong>{t(record.shortTitleKey as never)}</Text>
          <Text type="secondary" className="text-xs">{t(record.descriptionKey as never)}</Text>
        </Space>
      ),
    },
    {
      title: t('openingBalances.status'),
      key: 'status',
      render: (_value, record) => <StatusTag status={record.status} />,
      width: 130,
    },
    {
      title: t('generalLedger.debit'),
      key: 'debit',
      align: 'right',
      render: (_value, record) => record.batch?.status === 'POSTED' ? money(record.batch.total_debit) : '-',
      width: 160,
    },
    {
      title: t('generalLedger.credit'),
      key: 'credit',
      align: 'right',
      render: (_value, record) => record.batch?.status === 'POSTED' ? money(record.batch.total_credit) : '-',
      width: 160,
    },
    {
      title: '',
      key: 'action',
      align: 'right',
      render: (_value, record) => (
        <Button onClick={() => navigate({ to: record.route as never })}>
          {t('openingBalances.openModule')}
        </Button>
      ),
      width: 150,
    },
  ];

  return (
    <div className="p-3 sm:p-4 md:p-6 space-y-4">
      <div>
        <Title level={2} className="!mb-1 flex items-center gap-2">
          <Landmark size={24} />
          {t('openingBalances.title')}
        </Title>
        <Text type="secondary">{t('openingBalances.subtitle')}</Text>
      </div>

      {!cutoffDate && (
        <Alert
          type="warning"
          showIcon
          title={t('openingBalances.cutoffMissingTitle')}
          description={t('openingBalances.cutoffMissingDescription')}
        />
      )}

      <Card>
        <Descriptions size="small" column={{ xs: 1, sm: 2, lg: 4 }}>
          <Descriptions.Item label={t('generalLedger.cutoffDate')}>
            {cutoffDate ? formatDateOnly(cutoffDate) : '-'}
          </Descriptions.Item>
          <Descriptions.Item label={t('openingBalances.baseCurrency')}>
            {baseCurrencyCode}
          </Descriptions.Item>
          <Descriptions.Item label={t('openingBalances.currentPeriod')}>
            {currentPeriod}
          </Descriptions.Item>
          <Descriptions.Item label={t('openingBalances.totalPosted')}>
            {money(totalDebit)} / {money(totalCredit)}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Card>
        <Table
          dataSource={rows}
          columns={columns}
          rowKey="module"
          pagination={false}
          scroll={{ x: 760 }}
        />
      </Card>
    </div>
  );
}

export function OpeningBalanceAccountsPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const { setup } = useAccountingSetupStatus();
  const state = useLiveQuery(
    async () => {
      const [accounts, setting, batches] = await Promise.all([
        db.chartOfAccounts.orderBy('code').toArray(),
        db.generalLedgerSetting.get('default'),
        db.openingBalanceBatches.toArray(),
      ]);
      return { accounts, setting, batches };
    },
    [],
    { accounts: [], setting: undefined, batches: [] },
  );
  const effectiveSetting = useMemo<GeneralLedgerSetting | undefined>(() => {
    if (!setup) return state.setting;

    return {
      id: 'default',
      is_ready: state.setting?.is_ready ?? false,
      cutoff_date: setup.cutoff_date,
      inventory_policy: setup.inventory_policy,
      opening_balance_journal_id: state.setting?.opening_balance_journal_id,
      activated_at: state.setting?.activated_at,
      created_at: state.setting?.created_at ?? setup.created_at,
      updated_at: state.setting?.updated_at ?? setup.updated_at,
      sync_status: state.setting?.sync_status,
      sync_error: state.setting?.sync_error,
      last_synced_at: state.setting?.last_synced_at,
      remote_updated_at: state.setting?.remote_updated_at,
    };
  }, [setup, state.setting]);
  const batch = getBatchForModule(state.batches, 'ACCOUNT', effectiveSetting?.cutoff_date);
  const isLocked = batch?.status === 'POSTED' || batch?.status === 'SKIPPED';

  const handleSkip = async () => {
    try {
      await markOpeningBalanceModuleSkipped('ACCOUNT', t('openingBalances.skip.emptyNotes'));
      message.success(t('openingBalances.message.skipped'));
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('openingBalances.message.skipFailed'));
    }
  };

  return (
    <div className="p-3 sm:p-4 md:p-6 space-y-4">
      <Space wrap>
        <Button icon={<ArrowLeft size={16} />} onClick={() => navigate({ to: '/finance/opening-balances' })}>
          {t('common.back')}
        </Button>
        <StatusTag status={getBatchStatus(batch)} />
      </Space>

      <Card>
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <Title level={3} className="!mb-1">{t('openingBalances.modules.account.title')}</Title>
            <Text type="secondary">{t('openingBalances.modules.account.description')}</Text>
          </div>
          {!isLocked && (
            <Button icon={<CircleSlash size={16} />} onClick={handleSkip}>
              {t('openingBalances.skip')}
            </Button>
          )}
        </div>
      </Card>

      {batch?.status === 'SKIPPED' ? (
        <Alert type="success" showIcon title={t('openingBalances.skippedTitle')} />
      ) : (
        <OpeningBalanceForm
          accounts={state.accounts}
          setting={effectiveSetting}
        />
      )}
    </div>
  );
}

export function OpeningBalanceDetailPage({ module }: { module: Exclude<OpeningBalanceModule, 'ACCOUNT'> }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const { baseCurrencySymbol } = useBaseCurrency();
  const definition = getOpeningBalanceModuleDefinition(module);
  const state = useLiveQuery(
    async () => {
      const [setup, setting, batches] = await Promise.all([
        db.accountingInitialSetupSetting.get('default'),
        db.generalLedgerSetting.get('default'),
        db.openingBalanceBatches.toArray(),
      ]);
      const cutoffDate = setup?.cutoff_date ?? setting?.cutoff_date;
      const batch = getBatchForModule(batches, module, cutoffDate);
      const lines = batch
        ? await db.openingBalanceLines.where('batch_id').equals(batch.id).toArray()
        : [];

      return { cutoffDate, batch, lines };
    },
    [module],
    { cutoffDate: undefined, batch: undefined, lines: [] },
  );
  const [rows, setRows] = useState<EditableSourceLine[]>([createEditableLine()]);
  const isLocked = state.batch?.status === 'POSTED' || state.batch?.status === 'SKIPPED';
  const money = moneyFactory(baseCurrencySymbol);
  const draftTotal = rows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const persistedTotal = state.lines.reduce((sum, row) => sum + Number(row.base_amount || 0), 0);

  useEffect(() => {
    if (!state.cutoffDate || isLocked) return;
    setRows((current) => (
      current.length === 1 && !current[0].document_date
        ? [{ ...current[0], document_date: state.cutoffDate, due_date: state.cutoffDate }]
        : current
    ));
  }, [isLocked, state.cutoffDate]);

  const updateRow = (rowId: string, patch: Partial<EditableSourceLine>) => {
    setRows((current) => current.map((row) => row.id === rowId ? { ...row, ...patch } : row));
  };

  const handlePost = async () => {
    try {
      const payload: OpeningBalanceSourceLineInput[] = rows.map((row) => ({
        party_name: row.party_name,
        document_number: row.document_number,
        document_date: row.document_date,
        due_date: row.due_date,
        amount: Number(row.amount || 0),
        notes: row.notes,
      }));
      await postOpeningBalanceDetailBatch({ module, lines: payload });
      message.success(t('openingBalances.message.posted'));
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('openingBalances.message.postFailed'));
    }
  };

  const handleSkip = async () => {
    try {
      await markOpeningBalanceModuleSkipped(module, t('openingBalances.skip.emptyNotes'));
      message.success(t('openingBalances.message.skipped'));
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('openingBalances.message.skipFailed'));
    }
  };

  const draftColumns: ColumnsType<EditableSourceLine> = [
    {
      title: t('openingBalances.party'),
      dataIndex: 'party_name',
      key: 'party_name',
      render: (_value, record) => (
        <Input
          value={record.party_name}
          placeholder={t('openingBalances.partyPlaceholder')}
          onChange={(event) => updateRow(record.id, { party_name: event.target.value })}
        />
      ),
      width: 220,
    },
    {
      title: t('openingBalances.documentNumber'),
      dataIndex: 'document_number',
      key: 'document_number',
      render: (_value, record) => (
        <Input
          value={record.document_number}
          placeholder={t('openingBalances.documentNumberPlaceholder')}
          onChange={(event) => updateRow(record.id, { document_number: event.target.value })}
        />
      ),
      width: 190,
    },
    {
      title: t('openingBalances.documentDate'),
      dataIndex: 'document_date',
      key: 'document_date',
      render: (_value, record) => (
        <DatePicker
          value={record.document_date ? dayjs(record.document_date) : null}
          onChange={(value) => updateRow(record.id, { document_date: value?.startOf('day').toISOString() })}
        />
      ),
      width: 170,
    },
    {
      title: t('openingBalances.dueDate'),
      dataIndex: 'due_date',
      key: 'due_date',
      render: (_value, record) => (
        <DatePicker
          value={record.due_date ? dayjs(record.due_date) : null}
          onChange={(value) => updateRow(record.id, { due_date: value?.startOf('day').toISOString() })}
        />
      ),
      width: 170,
    },
    {
      title: t('finance.amount'),
      dataIndex: 'amount',
      key: 'amount',
      align: 'right',
      render: (_value, record) => (
        <InputNumber
          min={0}
          value={record.amount}
          onChange={(value) => updateRow(record.id, { amount: Number(value || 0) })}
        />
      ),
      width: 170,
    },
    {
      title: t('finance.transferNotes'),
      dataIndex: 'notes',
      key: 'notes',
      render: (_value, record) => (
        <Input
          value={record.notes}
          onChange={(event) => updateRow(record.id, { notes: event.target.value })}
        />
      ),
      width: 220,
    },
    {
      title: '',
      key: 'action',
      render: (_value, record) => (
        <Button
          icon={<Trash2 size={16} />}
          disabled={rows.length <= 1}
          onClick={() => setRows((current) => current.filter((row) => row.id !== record.id))}
        />
      ),
      width: 70,
    },
  ];

  const postedColumns: ColumnsType<OpeningBalanceLine> = [
    {
      title: t('openingBalances.party'),
      dataIndex: 'party_name',
      key: 'party_name',
      render: (value?: string) => value || '-',
    },
    {
      title: t('openingBalances.documentNumber'),
      dataIndex: 'document_number',
      key: 'document_number',
      render: (value?: string) => value || '-',
    },
    {
      title: t('openingBalances.documentDate'),
      dataIndex: 'document_date',
      key: 'document_date',
      render: (value?: string) => value ? formatDateOnly(value) : '-',
      width: 170,
    },
    {
      title: t('openingBalances.dueDate'),
      dataIndex: 'due_date',
      key: 'due_date',
      render: (value?: string) => value ? formatDateOnly(value) : '-',
      width: 170,
    },
    {
      title: t('finance.amount'),
      dataIndex: 'base_amount',
      key: 'base_amount',
      align: 'right',
      render: (value: number) => money(value),
      width: 180,
    },
  ];

  return (
    <div className="p-3 sm:p-4 md:p-6 space-y-4">
      <Space wrap>
        <Button icon={<ArrowLeft size={16} />} onClick={() => navigate({ to: '/finance/opening-balances' })}>
          {t('common.back')}
        </Button>
        <StatusTag status={getBatchStatus(state.batch)} />
      </Space>

      <Card>
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <Title level={3} className="!mb-1">{t(definition.titleKey as never)}</Title>
            <Text type="secondary">{t(definition.descriptionKey as never)}</Text>
          </div>
          {!isLocked && (
            <Space wrap>
              <Button icon={<CircleSlash size={16} />} onClick={handleSkip}>
                {t('openingBalances.skip')}
              </Button>
              <Button
                type="primary"
                icon={<CheckCircle2 size={16} />}
                onClick={handlePost}
                disabled={draftTotal <= 0}
              >
                {t('openingBalances.post')}
              </Button>
            </Space>
          )}
        </div>
      </Card>

      {state.batch?.status === 'SKIPPED' && (
        <Alert type="success" showIcon title={t('openingBalances.skippedTitle')} />
      )}

      {state.batch?.status === 'POSTED' && (
        <Alert
          type="success"
          showIcon
          title={t('openingBalances.postedTitle')}
          description={state.batch.journal_entry_id ? `${t('openingBalances.journalId')}: ${state.batch.journal_entry_id}` : undefined}
        />
      )}

      <Card>
        <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <Text strong>
            {t('common.total')}: {money(isLocked ? persistedTotal : draftTotal)}
          </Text>
          {!isLocked && (
            <Button
              icon={<Plus size={16} />}
              onClick={() => setRows((current) => [...current, createEditableLine(state.cutoffDate)])}
            >
              {t('openingBalances.addLine')}
            </Button>
          )}
        </div>
        {isLocked ? (
          <Table<OpeningBalanceLine>
            dataSource={state.lines}
            columns={postedColumns}
            rowKey="id"
            pagination={false}
            scroll={{ x: 1020 }}
          />
        ) : (
          <Table<EditableSourceLine>
            dataSource={rows}
            columns={draftColumns}
            rowKey="id"
            pagination={false}
            scroll={{ x: 1020 }}
          />
        )}
      </Card>

      {!isLocked && (
        <Alert
          type="info"
          showIcon
          icon={<FilePlus2 size={16} />}
          message={t('openingBalances.detailJournalHint')}
        />
      )}
    </div>
  );
}
