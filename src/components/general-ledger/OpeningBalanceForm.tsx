import { useMemo, useState } from 'react';
import { App, Alert, Button, DatePicker, InputNumber, Select, Space, Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { Dayjs } from 'dayjs';
import dayjs from '@/lib/dayjs';
import { postOpeningBalanceJournal } from '@/services/generalLedgerService';
import { useI18n } from '@/hooks/useI18n';
import { formatCurrency } from '@/utils/formatters';
import type { ChartOfAccount, GeneralLedgerSetting, InventoryAccountingPolicy } from '@/types';

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
  const { message } = App.useApp();
  const [cutoffDate, setCutoffDate] = useState<Dayjs | null>(
    setting?.cutoff_date ? dayjs(setting.cutoff_date) : dayjs(),
  );
  const [inventoryPolicy, setInventoryPolicy] = useState<InventoryAccountingPolicy>(
    setting?.inventory_policy ?? 'PERPETUAL_INVENTORY',
  );
  const [amountByAccountId, setAmountByAccountId] = useState<Record<string, { debit: number; credit: number }>>({});
  const [isPosting, setIsPosting] = useState(false);
  const isLocked = Boolean(setting?.opening_balance_journal_id);

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

  const updateAmount = (accountId: string, side: 'debit' | 'credit', value: number | null) => {
    const amount = Number(value || 0);
    setAmountByAccountId((current) => ({
      ...current,
      [accountId]: side === 'debit'
        ? { debit: amount, credit: amount > 0 ? 0 : current[accountId]?.credit ?? 0 }
        : { debit: amount > 0 ? 0 : current[accountId]?.debit ?? 0, credit: amount },
    }));
  };

  const handlePost = async () => {
    if (!cutoffDate) {
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
        cutoff_date: cutoffDate.startOf('day').toISOString(),
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

      <Space wrap className="mb-3">
        <DatePicker
          value={cutoffDate}
          disabled={isLocked}
          onChange={setCutoffDate}
        />
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
        pagination={{ pageSize: 8 }}
        scroll={{ x: 720 }}
        summary={() => (
          <Table.Summary.Row>
            <Table.Summary.Cell index={0}>
              <Text strong>{t('common.total')}</Text>
            </Table.Summary.Cell>
            <Table.Summary.Cell index={1} align="right">
              <Text strong>Rp {formatCurrency(totalDebit)}</Text>
            </Table.Summary.Cell>
            <Table.Summary.Cell index={2} align="right">
              <Text strong>Rp {formatCurrency(totalCredit)}</Text>
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
          disabled={isLocked || !hasLines || !isBalanced || !cutoffDate}
          onClick={handlePost}
        >
          {t('generalLedger.setup.postOpeningBalance')}
        </Button>
      </div>
    </div>
  );
}
