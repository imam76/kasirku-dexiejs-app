import { useEffect, useMemo, useState, type HTMLAttributes } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { App, Alert, Button, DatePicker, Input, InputNumber, Modal, Select, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useLiveQuery } from 'dexie-react-hooks';
import dayjs from '@/lib/dayjs';
import { db } from '@/lib/db';
import {
  ACCOUNT_OPENING_BALANCE_ADJUSTMENT_SOURCE_EVENT,
  OPENING_BALANCE_EQUITY_CANDIDATE,
  buildAccountOpeningBalancePreview,
  getDefaultAccountOpeningBalanceAdjustmentDate,
  getManagedAccountOpeningBalanceBlocks,
  isOpeningBalanceBatchPosted,
  postAccountOpeningBalanceBatch,
  postAccountOpeningBalanceAdjustment,
  saveAccountOpeningBalanceDraft,
  type AccountOpeningBalancePreviewLine,
} from '@/services/openingBalanceService';
import { useBaseCurrency } from '@/hooks/useBaseCurrency';
import { useI18n } from '@/hooks/useI18n';
import { formatCurrency, formatDateOnly } from '@/utils/formatters';
import type { ChartOfAccount, GeneralLedgerSetting, InventoryAccountingPolicy, JournalEntry, OpeningBalanceBatch, OpeningBalanceLine } from '@/types';

const LOAN_RECEIVABLE_ACCOUNT_ID = 'cooperative-loan-receivable';
const LOAN_RECEIVABLE_ACCOUNT_CODE = '1120';
const OWNER_CAPITAL_CANDIDATE = {
  ids: ['owner-capital', 'template-owner-capital'],
  codes: ['3000'],
};
const roundCurrencyValue = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

const { Text } = Typography;
const EMPTY_OPENING_BALANCE_LINES: OpeningBalanceLine[] = [];

interface OpeningBalanceFormProps {
  accounts: ChartOfAccount[];
  setting?: GeneralLedgerSetting;
  batch?: OpeningBalanceBatch;
  lines?: OpeningBalanceLine[];
  onPosted?: () => void;
}

interface OpeningBalanceRow {
  account: ChartOfAccount;
  debit: number;
  credit: number;
  managedBy?: string;
}

const roundCurrency = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

const findAccountCandidate = (
  accounts: ChartOfAccount[],
  candidate: { ids: string[]; codes: string[] },
) => {
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const accountByCode = new Map(accounts.map((account) => [account.code, account]));

  return candidate.ids
    .map((id) => accountById.get(id))
    .find(Boolean) ?? candidate.codes.map((code) => accountByCode.get(code)).find(Boolean);
};

export default function OpeningBalanceForm({
  accounts,
  setting,
  batch,
  lines = EMPTY_OPENING_BALANCE_LINES,
  onPosted,
}: OpeningBalanceFormProps) {
  const { t } = useI18n();
  const { baseCurrencySymbol } = useBaseCurrency();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [inventoryPolicy, setInventoryPolicy] = useState<InventoryAccountingPolicy>(
    setting?.inventory_policy ?? 'PERPETUAL_INVENTORY',
  );
  const [amountByAccountId, setAmountByAccountId] = useState<Record<string, { debit: number; credit: number }>>({});
  const [isDirty, setIsDirty] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [isPosting, setIsPosting] = useState(false);
  const [isAdjustmentModalOpen, setIsAdjustmentModalOpen] = useState(false);
  const [isPostingAdjustment, setIsPostingAdjustment] = useState(false);
  const [adjustmentEntryDate, setAdjustmentEntryDate] = useState<string>();
  const [adjustmentDebitAccountId, setAdjustmentDebitAccountId] = useState<string>();
  const [adjustmentCreditAccountId, setAdjustmentCreditAccountId] = useState<string>();
  const [adjustmentAmount, setAdjustmentAmount] = useState<number>(0);
  const [adjustmentNotes, setAdjustmentNotes] = useState<string>();
  const isLocked = isOpeningBalanceBatchPosted(batch) ||
    batch?.status === 'SKIPPED' ||
    batch?.status === 'REVERSED' ||
    batch?.status === 'VOIDED' ||
    (!batch && Boolean(setting?.opening_balance_journal_id));
  const configuredCutoffDate = setting?.cutoff_date ? dayjs(setting.cutoff_date) : null;
  const configuredCutoffDateValue = setting?.cutoff_date;

  useEffect(() => {
    if (setting?.inventory_policy) {
      setInventoryPolicy(setting.inventory_policy);
    }
  }, [setting?.inventory_policy]);

  const linesRevision = useMemo(
    () => lines.map((line) => `${line.id}:${line.debit}:${line.credit}:${line.updated_at}`).sort().join('|'),
    [lines],
  );

  useEffect(() => {
    const nextAmountByAccountId = Object.fromEntries(
      lines
        .filter((line) => line.account_id)
        .map((line) => [
          line.account_id as string,
          {
            debit: Number(line.debit || 0),
            credit: Number(line.credit || 0),
          },
        ]),
    );

    setAmountByAccountId(nextAmountByAccountId);
    setIsDirty(false);
  }, [batch?.id, linesRevision, lines]);

  useEffect(() => {
    if (!isDirty || isLocked) return undefined;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty, isLocked]);

  const managedBlocks = useLiveQuery(
    async () => {
      if (!configuredCutoffDateValue) return [];
      return getManagedAccountOpeningBalanceBlocks(configuredCutoffDateValue);
    },
    [configuredCutoffDateValue],
    [],
  );
  const managedByAccountId = useMemo(() => (
    new Map(managedBlocks.map((block) => [block.account.id, block.label]))
  ), [managedBlocks]);
  const equityAccount = useMemo(
    () => findAccountCandidate(accounts, OPENING_BALANCE_EQUITY_CANDIDATE),
    [accounts],
  );
  const ownerCapitalAccount = useMemo(
    () => findAccountCandidate(accounts, OWNER_CAPITAL_CANDIDATE),
    [accounts],
  );
  const balanceAccountOptions = useMemo(() => accounts
    .filter((account) => (
      account.is_active &&
      account.is_postable &&
      (account.type === 'ASSET' || account.type === 'LIABILITY' || account.type === 'EQUITY')
    ))
    .map((account) => ({
      value: account.id,
      label: `${account.code} - ${account.name}`,
    })), [accounts]);
  const rows = useMemo<OpeningBalanceRow[]>(() => {
    return accounts
      .filter((account) => account.is_active && account.is_postable)
      .map((account) => ({
        account,
        debit: amountByAccountId[account.id]?.debit ?? 0,
        credit: amountByAccountId[account.id]?.credit ?? 0,
        managedBy: managedByAccountId.get(account.id),
      }));
  }, [accounts, amountByAccountId, managedByAccountId]);
  const inputRows = useMemo(
    () => rows,
    [rows],
  );
  const totalDebit = roundCurrency(inputRows.reduce((sum, row) => sum + row.debit, 0));
  const totalCredit = roundCurrency(inputRows.reduce((sum, row) => sum + row.credit, 0));
  const isBalanced = Math.abs(totalDebit - totalCredit) <= 0.01;
  const difference = roundCurrency(totalDebit - totalCredit);
  const hasLines = inputRows.some((row) => row.debit > 0 || row.credit > 0);
  const hasManagedLineValues = inputRows.some((row) => row.managedBy && (row.debit > 0 || row.credit > 0));
  const hasOpeningBalanceEquityAccount = Boolean(equityAccount?.is_active && equityAccount.is_postable);
  const canPost = hasLines && !hasManagedLineValues && (isBalanced || hasOpeningBalanceEquityAccount);
  const money = (value: number) => `${baseCurrencySymbol} ${formatCurrency(value || 0)}`;
  const previewLines = useMemo<AccountOpeningBalancePreviewLine[]>(() => (
    isLocked && lines.length > 0
      ? lines
        .filter((line) => line.account_id && (Number(line.debit || 0) > 0 || Number(line.credit || 0) > 0))
        .map((line) => ({
          account_id: line.account_id as string,
          account_code: line.account_code ?? '',
          account_name: line.account_name ?? '',
          debit: Number(line.debit || 0),
          credit: Number(line.credit || 0),
          notes: line.notes,
          is_adjustment: line.id.endsWith('-line-opening-balance-equity'),
        }))
      : buildAccountOpeningBalancePreview({
        lines: inputRows
          .filter((row) => row.debit > 0 || row.credit > 0)
          .map((row) => ({
            account: row.account,
            debit: row.debit,
            credit: row.credit,
            notes: t('generalLedger.setup.openingLineDescription'),
          })),
        equityAccount: hasOpeningBalanceEquityAccount ? equityAccount : undefined,
        adjustmentNotes: t('openingBalances.account.adjustmentLine'),
        autoBalanceWithEquity: true,
      })
  ), [equityAccount, hasOpeningBalanceEquityAccount, inputRows, isLocked, lines, t]);
  const previewTotalDebit = roundCurrency(previewLines.reduce((sum, line) => sum + line.debit, 0));
  const previewTotalCredit = roundCurrency(previewLines.reduce((sum, line) => sum + line.credit, 0));
  const postedEquityResidual = useMemo(() => {
    if (!equityAccount) return 0;
    const equityLine = lines.find((line) => (
      line.account_id === equityAccount.id ||
      line.account_code === equityAccount.code
    ));
    return roundCurrency(Number(equityLine?.credit || 0) - Number(equityLine?.debit || 0));
  }, [equityAccount, lines]);
  const adjustmentEntries = useLiveQuery(
    async () => {
      if (!batch?.id) return [];
      const sourceIdPrefix = `${batch.id}:adjustment:`;
      const entries = await db.journalEntries
        .where('source_type')
        .equals('OPENING_BALANCE')
        .filter((entry) => (
          entry.status === 'POSTED' &&
          entry.source_event === ACCOUNT_OPENING_BALANCE_ADJUSTMENT_SOURCE_EVENT &&
          (entry.source_number === batch.id || Boolean(entry.source_id?.startsWith(sourceIdPrefix)))
        ))
        .toArray();

      return entries.sort((a, b) => (a.entry_date < b.entry_date ? 1 : -1));
    },
    [batch?.id],
    [],
  );

  const updateAmount = (accountId: string, side: 'debit' | 'credit', value: number | null) => {
    const amount = Number(value || 0);
    setAmountByAccountId((current) => ({
      ...current,
      [accountId]: side === 'debit'
        ? { debit: amount, credit: amount > 0 ? 0 : current[accountId]?.credit ?? 0 }
        : { debit: amount > 0 ? 0 : current[accountId]?.debit ?? 0, credit: amount },
    }));
    setIsDirty(true);
  };

  // Jembatan saldo awal pinjaman: pinjaman migrasi tidak menjurnal, jadi piutangnya harus masuk
  // lewat baris Piutang Pinjaman (1120) di saldo awal ini.
  const migrationReceivableTotal = useLiveQuery(
    async () => {
      const migrationLoans = await db.cooperativeLoans
        .filter((loan) => Boolean(loan.is_migration))
        .toArray();
      return roundCurrencyValue(migrationLoans.reduce(
        (sum, loan) => sum + Number(loan.outstanding_principal_amount || 0),
        0,
      ));
    },
    [],
    0,
  );
  const loanReceivableAccount = useMemo(
    () => accounts.find(
      (account) => account.id === LOAN_RECEIVABLE_ACCOUNT_ID || account.code === LOAN_RECEIVABLE_ACCOUNT_CODE,
    ),
    [accounts],
  );
  const showMigrationHint = !isLocked && migrationReceivableTotal > 0 && Boolean(loanReceivableAccount);

  const fillMigrationReceivable = () => {
    if (!loanReceivableAccount) return;
    updateAmount(loanReceivableAccount.id, 'debit', migrationReceivableTotal);
  };

  const openAdjustmentModal = async () => {
    if (!isOpeningBalanceBatchPosted(batch)) return;

    try {
      const defaultDate = await getDefaultAccountOpeningBalanceAdjustmentDate();
      setAdjustmentEntryDate(defaultDate);
      setAdjustmentNotes(t('openingBalances.account.adjustmentDefaultNotes'));

      if (equityAccount && ownerCapitalAccount && postedEquityResidual !== 0) {
        setAdjustmentAmount(Math.abs(postedEquityResidual));
        if (postedEquityResidual > 0) {
          setAdjustmentDebitAccountId(equityAccount.id);
          setAdjustmentCreditAccountId(ownerCapitalAccount.id);
        } else {
          setAdjustmentDebitAccountId(ownerCapitalAccount.id);
          setAdjustmentCreditAccountId(equityAccount.id);
        }
      } else {
        setAdjustmentAmount(0);
        setAdjustmentDebitAccountId(equityAccount?.id);
        setAdjustmentCreditAccountId(ownerCapitalAccount?.id);
      }

      setIsAdjustmentModalOpen(true);
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('openingBalances.message.adjustmentFailed'));
    }
  };

  const closeAdjustmentModal = () => {
    if (isPostingAdjustment) return;
    setIsAdjustmentModalOpen(false);
  };

  const handlePost = async () => {
    if (!configuredCutoffDate) {
      message.warning(t('generalLedger.setup.cutoffRequired'));
      return;
    }

    if (!hasLines) {
      message.warning(t('openingBalances.account.lineRequired'));
      return;
    }

    if (hasManagedLineValues) {
      message.warning(t('openingBalances.account.managedBlocked'));
      return;
    }

    if (!isBalanced && !hasOpeningBalanceEquityAccount) {
      message.warning(t('openingBalances.account.unbalancedPostBlocked'));
      return;
    }

    try {
      setIsPosting(true);
      await postAccountOpeningBalanceBatch({
        lines: inputRows
          .filter((row) => row.debit > 0 || row.credit > 0)
          .map((row) => ({
            account_id: row.account.id,
            debit: row.debit,
            credit: row.credit,
            notes: t('generalLedger.setup.openingLineDescription'),
          })),
        notes: t('openingBalances.account.defaultNotes'),
      });
      message.success(t('generalLedger.setup.postSuccess'));
      setIsDirty(false);
      onPosted?.();
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('generalLedger.setup.postFailed'));
    } finally {
      setIsPosting(false);
    }
  };

  const handleSaveDraft = async () => {
    if (!configuredCutoffDate) {
      message.warning(t('generalLedger.setup.cutoffRequired'));
      return;
    }

    if (hasManagedLineValues) {
      message.warning(t('openingBalances.account.managedBlocked'));
      return;
    }

    try {
      setIsSavingDraft(true);
      await saveAccountOpeningBalanceDraft({
        lines: inputRows
          .filter((row) => row.debit > 0 || row.credit > 0)
          .map((row) => ({
            account_id: row.account.id,
            debit: row.debit,
            credit: row.credit,
            notes: t('generalLedger.setup.openingLineDescription'),
          })),
        notes: t('openingBalances.account.defaultNotes'),
      });
      message.success(t('openingBalances.message.draftSaved'));
      setIsDirty(false);
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('openingBalances.message.draftSaveFailed'));
    } finally {
      setIsSavingDraft(false);
    }
  };

  const handlePostAdjustment = async () => {
    if (!adjustmentDebitAccountId || !adjustmentCreditAccountId || adjustmentAmount <= 0) {
      message.warning(t('openingBalances.account.adjustmentRequired'));
      return;
    }

    try {
      setIsPostingAdjustment(true);
      await postAccountOpeningBalanceAdjustment({
        entry_date: adjustmentEntryDate,
        lines: [
          {
            account_id: adjustmentDebitAccountId,
            debit: adjustmentAmount,
            credit: 0,
            notes: adjustmentNotes,
          },
          {
            account_id: adjustmentCreditAccountId,
            debit: 0,
            credit: adjustmentAmount,
            notes: adjustmentNotes,
          },
        ],
        notes: adjustmentNotes,
      });
      message.success(t('openingBalances.message.adjustmentPosted'));
      setIsAdjustmentModalOpen(false);
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('openingBalances.message.adjustmentFailed'));
    } finally {
      setIsPostingAdjustment(false);
    }
  };

  const columns: ColumnsType<OpeningBalanceRow> = [
    {
      title: t('generalLedger.account'),
      key: 'account',
      render: (_value, record) => (
        <Space direction="vertical" size={0}>
          <Text>{record.account.code} - {record.account.name}</Text>
          {record.managedBy && (
            <Text type="warning" className="text-xs">
              {t('openingBalances.account.managedBy', { module: record.managedBy })}
            </Text>
          )}
        </Space>
      ),
    },
    {
      title: t('generalLedger.debit'),
      dataIndex: 'debit',
      key: 'debit',
      align: 'right',
      width: 190,
      render: (_value, record) => (
        <InputNumber
          min={0}
          value={record.debit}
          disabled={isLocked || Boolean(record.managedBy && record.debit <= 0 && record.credit <= 0)}
          data-testid={`gl-opening-balance-debit-${record.account.code}`}
          onChange={(value) => updateAmount(record.account.id, 'debit', value)}
        />
      ),
    },
    {
      title: t('generalLedger.credit'),
      dataIndex: 'credit',
      key: 'credit',
      align: 'right',
      width: 190,
      render: (_value, record) => (
        <InputNumber
          min={0}
          value={record.credit}
          disabled={isLocked || Boolean(record.managedBy && record.debit <= 0 && record.credit <= 0)}
          data-testid={`gl-opening-balance-credit-${record.account.code}`}
          onChange={(value) => updateAmount(record.account.id, 'credit', value)}
        />
      ),
    },
  ];

  const previewColumns: ColumnsType<AccountOpeningBalancePreviewLine> = [
    {
      title: t('generalLedger.account'),
      key: 'account',
      render: (_value, record) => (
        <Space size={6}>
          <Text>{record.account_code} - {record.account_name}</Text>
          {record.is_adjustment && <Tag color="gold">{t('openingBalances.account.autoLine')}</Tag>}
        </Space>
      ),
    },
    {
      title: t('generalLedger.debit'),
      dataIndex: 'debit',
      key: 'debit',
      align: 'right',
      render: (value: number) => value > 0 ? money(value) : '-',
      width: 180,
    },
    {
      title: t('generalLedger.credit'),
      dataIndex: 'credit',
      key: 'credit',
      align: 'right',
      render: (value: number) => value > 0 ? money(value) : '-',
      width: 180,
    },
  ];

  const adjustmentHistoryColumns: ColumnsType<JournalEntry> = [
    {
      title: t('generalLedger.manual.entryDate'),
      dataIndex: 'entry_date',
      key: 'entry_date',
      render: (value: string) => formatDateOnly(value),
      width: 140,
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
      dataIndex: 'total_debit',
      key: 'total_debit',
      align: 'right',
      render: (value: number) => money(value),
      width: 180,
    },
  ];

  return (
    <div className="rounded-md border border-gray-100 bg-white p-4">
      <div className="mb-3">
        <Text strong>{t('generalLedger.setup.title')}</Text>
        <div className="mt-1 text-sm text-gray-500">{t('generalLedger.setup.description')}</div>
      </div>

      {isLocked && (
        <Alert
          className="mb-3"
          type="success"
          showIcon
          title={batch?.status === 'SKIPPED' ? t('openingBalances.skippedTitle') : t('generalLedger.setup.alreadyPosted')}
          action={isOpeningBalanceBatchPosted(batch) ? (
            <Button
              size="small"
              data-testid="gl-opening-balance-adjustment-button"
              onClick={openAdjustmentModal}
            >
              {t('openingBalances.account.adjustmentAction')}
            </Button>
          ) : undefined}
        />
      )}

      {!configuredCutoffDate && !isLocked && (
        <Alert
          className="mb-3"
          type="warning"
          showIcon
          message={t('generalLedger.setup.cutoffMissingTitle')}
          description={t('generalLedger.setup.cutoffMissingDescription')}
          action={(
            <Button size="small" onClick={() => navigate({ to: '/settings' })}>
              {t('generalLedger.setup.openAccountingSettings')}
            </Button>
          )}
        />
      )}

      {showMigrationHint && (
        <Alert
          className="mb-3"
          type="warning"
          showIcon
          message={t('generalLedger.setup.migrationReceivableHint', {
            amount: money(migrationReceivableTotal),
          })}
          action={(
            <Button
              size="small"
              data-testid="gl-opening-balance-fill-migration"
              onClick={fillMigrationReceivable}
            >
              {t('generalLedger.setup.fillMigrationReceivable')}
            </Button>
          )}
        />
      )}

      <Space wrap className="mb-3">
        <Text type="secondary">
          {configuredCutoffDate
            ? `${t('generalLedger.cutoffDate')}: ${formatDateOnly(setting?.cutoff_date ?? configuredCutoffDate.toISOString())}`
            : t('settings.accountingNoCutoff')}
        </Text>
        <Select
          value={inventoryPolicy}
          disabled={isLocked}
          onChange={setInventoryPolicy}
          className="min-w-[240px]"
          options={[
            {
              value: 'PERPETUAL_INVENTORY',
              label: t('generalLedger.inventoryPolicy.perpetual'),
            },
            {
              value: 'CASH_FLOW_ONLY',
              label: t('generalLedger.inventoryPolicy.cashFlowOnly'),
            },
          ]}
        />
      </Space>

      <Table
        dataSource={rows}
        columns={columns}
        rowKey={(row) => row.account.id}
        onRow={(row) => ({
          'data-testid': `gl-opening-balance-row-${row.account.code}`,
        } as unknown as HTMLAttributes<HTMLElement>)}
        pagination={{ pageSize: 8 }}
        scroll={{ x: 720 }}
        summary={() => (
          <Table.Summary.Row>
            <Table.Summary.Cell index={0}>
              <Text strong>{t('common.total')}</Text>
            </Table.Summary.Cell>
            <Table.Summary.Cell index={1} align="right">
              <Text strong>{money(totalDebit)}</Text>
            </Table.Summary.Cell>
            <Table.Summary.Cell index={2} align="right">
              <Text strong>{money(totalCredit)}</Text>
            </Table.Summary.Cell>
          </Table.Summary.Row>
        )}
      />

      {!isBalanced && (
        <Alert
          className="mt-3"
          type="warning"
          showIcon
          title={t('openingBalances.account.unbalancedTitle', {
            amount: money(Math.abs(difference)),
          })}
          description={hasOpeningBalanceEquityAccount
            ? t('openingBalances.account.unbalancedDescription', {
              account: equityAccount ? `${equityAccount.code} - ${equityAccount.name}` : '',
            })
            : t('openingBalances.account.equityMissing')}
        />
      )}

      {hasManagedLineValues && (
        <Alert className="mt-3" type="warning" showIcon title={t('openingBalances.account.managedBlocked')} />
      )}

      {previewLines.length > 0 && (
        <div className="mt-4">
          <div className="mb-2 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <Text strong>{t('openingBalances.account.previewTitle')}</Text>
            <Text type="secondary">
              {t('generalLedger.debit')}: {money(previewTotalDebit)} / {t('generalLedger.credit')}: {money(previewTotalCredit)}
            </Text>
          </div>
          <Table
            dataSource={previewLines}
            columns={previewColumns}
            rowKey={(row) => `${row.account_id}-${row.is_adjustment ? 'adjustment' : 'input'}`}
            pagination={false}
            size="small"
            scroll={{ x: 640 }}
          />
        </div>
      )}

      {isDirty && !isLocked && (
        <Text className="mt-3 block" type="secondary">{t('openingBalances.account.unsavedChanges')}</Text>
      )}

      {adjustmentEntries.length > 0 && (
        <div className="mt-4">
          <Text strong>{t('openingBalances.account.adjustmentHistoryTitle')}</Text>
          <Table
            className="mt-2"
            dataSource={adjustmentEntries}
            columns={adjustmentHistoryColumns}
            rowKey="id"
            pagination={false}
            size="small"
            scroll={{ x: 720 }}
          />
        </div>
      )}

      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <Button
          loading={isSavingDraft}
          disabled={isLocked || !configuredCutoffDate || hasManagedLineValues}
          data-testid="gl-opening-balance-save-draft-button"
          onClick={handleSaveDraft}
        >
          {t('openingBalances.saveDraft')}
        </Button>
        <Button
          type="primary"
          loading={isPosting}
          disabled={isLocked || !configuredCutoffDate || !canPost}
          data-testid="gl-opening-balance-post-button"
          onClick={handlePost}
        >
          {t('generalLedger.setup.postOpeningBalance')}
        </Button>
      </div>

      <Modal
        title={t('openingBalances.account.adjustmentModalTitle')}
        open={isAdjustmentModalOpen}
        onCancel={closeAdjustmentModal}
        onOk={handlePostAdjustment}
        confirmLoading={isPostingAdjustment}
        okText={t('openingBalances.account.adjustmentPost')}
        destroyOnHidden
      >
        <Space direction="vertical" size="middle" className="w-full">
          <div>
            <Text type="secondary">{t('openingBalances.account.adjustmentDate')}</Text>
            <DatePicker
              className="mt-1 w-full"
              value={adjustmentEntryDate ? dayjs(adjustmentEntryDate) : null}
              onChange={(value) => setAdjustmentEntryDate(value?.startOf('day').toISOString())}
            />
          </div>
          <div>
            <Text type="secondary">{t('openingBalances.account.adjustmentDebitAccount')}</Text>
            <Select
              className="mt-1 w-full"
              showSearch
              optionFilterProp="label"
              value={adjustmentDebitAccountId}
              options={balanceAccountOptions}
              onChange={setAdjustmentDebitAccountId}
            />
          </div>
          <div>
            <Text type="secondary">{t('openingBalances.account.adjustmentCreditAccount')}</Text>
            <Select
              className="mt-1 w-full"
              showSearch
              optionFilterProp="label"
              value={adjustmentCreditAccountId}
              options={balanceAccountOptions}
              onChange={setAdjustmentCreditAccountId}
            />
          </div>
          <div>
            <Text type="secondary">{t('openingBalances.account.adjustmentAmount')}</Text>
            <InputNumber
              className="mt-1 w-full"
              min={0}
              value={adjustmentAmount}
              onChange={(value) => setAdjustmentAmount(Number(value || 0))}
            />
          </div>
          <div>
            <Text type="secondary">{t('openingBalances.account.adjustmentNotes')}</Text>
            <Input.TextArea
              className="mt-1"
              rows={3}
              value={adjustmentNotes}
              onChange={(event) => setAdjustmentNotes(event.target.value)}
            />
          </div>
        </Space>
      </Modal>
    </div>
  );
}
