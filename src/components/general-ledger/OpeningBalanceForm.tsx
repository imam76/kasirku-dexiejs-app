import { useEffect, useMemo, useState, type HTMLAttributes } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { App, Alert, Button, InputNumber, Select, Space, Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useLiveQuery } from 'dexie-react-hooks';
import dayjs from '@/lib/dayjs';
import { db } from '@/lib/db';
import { postOpeningBalanceJournal } from '@/services/generalLedgerService';
import { useBaseCurrency } from '@/hooks/useBaseCurrency';
import { useI18n } from '@/hooks/useI18n';
import { formatCurrency, formatDateOnly } from '@/utils/formatters';
import type { ChartOfAccount, GeneralLedgerSetting, InventoryAccountingPolicy } from '@/types';

const LOAN_RECEIVABLE_ACCOUNT_ID = 'cooperative-loan-receivable';
const LOAN_RECEIVABLE_ACCOUNT_CODE = '1120';
const roundCurrencyValue = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

const { Text } = Typography;

interface OpeningBalanceFormProps {
  accounts: ChartOfAccount[];
  setting?: GeneralLedgerSetting;
  onPosted?: () => void;
}

interface OpeningBalanceRow {
  account: ChartOfAccount;
  debit: number;
  credit: number;
}

const roundCurrency = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export default function OpeningBalanceForm({
  accounts,
  setting,
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
  const [isPosting, setIsPosting] = useState(false);
  const isLocked = Boolean(setting?.opening_balance_journal_id);
  const configuredCutoffDate = setting?.cutoff_date ? dayjs(setting.cutoff_date) : null;

  useEffect(() => {
    if (setting?.inventory_policy) {
      setInventoryPolicy(setting.inventory_policy);
    }
  }, [setting?.inventory_policy]);

  const rows = useMemo<OpeningBalanceRow[]>(() => {
    return accounts
      .filter((account) => account.is_active && account.is_postable)
      .map((account) => ({
        account,
        debit: amountByAccountId[account.id]?.debit ?? 0,
        credit: amountByAccountId[account.id]?.credit ?? 0,
      }));
  }, [accounts, amountByAccountId]);
  const totalDebit = roundCurrency(rows.reduce((sum, row) => sum + row.debit, 0));
  const totalCredit = roundCurrency(rows.reduce((sum, row) => sum + row.credit, 0));
  const isBalanced = Math.abs(totalDebit - totalCredit) <= 0.01;
  const hasLines = rows.some((row) => row.debit > 0 || row.credit > 0);
  const money = (value: number) => `${baseCurrencySymbol} ${formatCurrency(value || 0)}`;

  const updateAmount = (accountId: string, side: 'debit' | 'credit', value: number | null) => {
    const amount = Number(value || 0);
    setAmountByAccountId((current) => ({
      ...current,
      [accountId]: side === 'debit'
        ? { debit: amount, credit: amount > 0 ? 0 : current[accountId]?.credit ?? 0 }
        : { debit: amount > 0 ? 0 : current[accountId]?.debit ?? 0, credit: amount },
    }));
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

  const handlePost = async () => {
    if (!configuredCutoffDate) {
      message.warning(t('generalLedger.setup.cutoffRequired'));
      return;
    }

    if (!hasLines || !isBalanced) {
      message.warning(t('generalLedger.setup.balanceError'));
      return;
    }

    try {
      setIsPosting(true);
      await postOpeningBalanceJournal({
        cutoff_date: configuredCutoffDate.startOf('day').toISOString(),
        inventory_policy: inventoryPolicy,
        lines: rows
          .filter((row) => row.debit > 0 || row.credit > 0)
          .map((row) => ({
            account_id: row.account.id,
            debit: row.debit,
            credit: row.credit,
            description: t('generalLedger.setup.openingLineDescription'),
          })),
      });
      message.success(t('generalLedger.setup.postSuccess'));
      onPosted?.();
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('generalLedger.setup.postFailed'));
    } finally {
      setIsPosting(false);
    }
  };

  const columns: ColumnsType<OpeningBalanceRow> = [
    {
      title: t('generalLedger.account'),
      key: 'account',
      render: (_value, record) => `${record.account.code} - ${record.account.name}`,
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
          disabled={isLocked}
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
          disabled={isLocked}
          data-testid={`gl-opening-balance-credit-${record.account.code}`}
          onChange={(value) => updateAmount(record.account.id, 'credit', value)}
        />
      ),
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
          title={t('generalLedger.setup.alreadyPosted')}
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
        <Alert className="mt-3" type="error" showIcon title={t('generalLedger.setup.balanceError')} />
      )}

      <div className="mt-3 flex justify-end">
        <Button
          type="primary"
          loading={isPosting}
          disabled={isLocked || !hasLines || !isBalanced || !configuredCutoffDate}
          data-testid="gl-opening-balance-post-button"
          onClick={handlePost}
        >
          {t('generalLedger.setup.postOpeningBalance')}
        </Button>
      </div>
    </div>
  );
}
