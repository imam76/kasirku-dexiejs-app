import { useEffect, useMemo, useRef, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, App, Button, Card, DatePicker, Empty, Form, Input, InputNumber, Modal, Select, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { ArrowLeft, CheckCircle2, RotateCcw, Save, Scale } from 'lucide-react';
import dayjs from '@/lib/dayjs';
import {
  cashBankReconciliationSchema,
  type CashBankReconciliationFormData,
  type CashBankReconciliationFormValues,
} from '@/lib/validations/cashBankReconciliation';
import { useCashBankReconciliation } from '@/hooks/useCashBankReconciliation';
import { useI18n } from '@/hooks/useI18n';
import { getFinanceCategoryLabel } from '@/i18n/finance';
import { getFinanceTransactionBusinessType } from '@/constants/finance';
import { formatCurrency, formatDate } from '@/utils/formatters';
import type { CashBankReconciliation, ChartOfAccount, FinanceTransaction } from '@/types';

const { Title, Text } = Typography;

const getStatusTag = (status: CashBankReconciliation['status']) => {
  if (status === 'BALANCED') return <Tag color="green">Balanced</Tag>;
  if (status === 'VOIDED') return <Tag color="default">Void</Tag>;
  return <Tag color="orange">Selisih</Tag>;
};

const money = (value: number) => `Rp ${formatCurrency(value)}`;

export default function CashBankReconciliationManagement() {
  const { modal } = App.useApp();
  const { t } = useI18n();
  const [voidTarget, setVoidTarget] = useState<CashBankReconciliation | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const autoSelectedAdjustmentAccountId = useRef<string | null>(null);
  const {
    control,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<CashBankReconciliationFormValues, unknown, CashBankReconciliationFormData>({
    resolver: zodResolver(cashBankReconciliationSchema),
    defaultValues: {
      cash_account_id: '',
      statement_date: new Date().toISOString(),
      statement_reference: '',
      statement_ending_balance: 0,
      selected_transaction_ids: [],
      adjustment_account_id: '',
      notes: '',
    },
  });
  const cashAccountId = useWatch({ control, name: 'cash_account_id' });
  const statementDate = useWatch({ control, name: 'statement_date' });
  const statementEndingBalance = Number(useWatch({ control, name: 'statement_ending_balance' }) || 0);
  const adjustmentAccountId = useWatch({ control, name: 'adjustment_account_id' });
  const watchedSelectedTransactionIds = useWatch({ control, name: 'selected_transaction_ids' });
  const selectedTransactionIds = useMemo(
    () => watchedSelectedTransactionIds ?? [],
    [watchedSelectedTransactionIds],
  );
  const {
    cashBankAccounts,
    isLoadingCashBankAccounts,
    adjustmentAccounts,
    isLoadingAdjustmentAccounts,
    candidates,
    isLoadingCandidates,
    reconciliations,
    isLoadingReconciliations,
    createReconciliation,
    isCreatingReconciliation,
    voidReconciliation,
    isVoidingReconciliation,
  } = useCashBankReconciliation({ cashAccountId, statementDate });

  const accountOptions = useMemo(() => cashBankAccounts.map((account) => ({
    value: account.id,
    label: `${account.code} - ${account.name}`,
  })), [cashBankAccounts]);
  const adjustmentAccountOptions = useMemo(() => adjustmentAccounts.map((account) => ({
    value: account.id,
    label: `${account.code} - ${account.name}`,
  })), [adjustmentAccounts]);

  useEffect(() => {
    if (!cashAccountId && cashBankAccounts[0]) {
      setValue('cash_account_id', cashBankAccounts[0].id);
    }
  }, [cashAccountId, cashBankAccounts, setValue]);

  useEffect(() => {
    const candidateIds = new Set((candidates?.rows ?? []).map((row) => row.transaction.id));
    const nextSelectedIds = selectedTransactionIds.filter((transactionId) => candidateIds.has(transactionId));
    if (nextSelectedIds.length !== selectedTransactionIds.length) {
      setValue('selected_transaction_ids', nextSelectedIds, { shouldValidate: true });
    }
  }, [candidates?.rows, selectedTransactionIds, setValue]);

  const selectedTotal = useMemo(() => {
    const selectedIds = new Set(selectedTransactionIds);
    return (candidates?.rows ?? [])
      .filter((row) => selectedIds.has(row.transaction.id))
      .reduce((sum, row) => sum + row.signed_amount, 0);
  }, [candidates?.rows, selectedTransactionIds]);
  const clearedBalance = (candidates?.existing_cleared_balance_amount ?? 0) + selectedTotal;
  const differenceAmount = statementEndingBalance - clearedBalance;
  const requiresAdjustmentAccount = Math.abs(differenceAmount) > 0.01;
  const preferredAdjustmentAccountTypes = useMemo<Array<ChartOfAccount['type']>>(() => (
    differenceAmount > 0 ? ['REVENUE', 'CONTRA_REVENUE'] : ['EXPENSE']
  ), [differenceAmount]);
  const selectedAdjustmentAccount = useMemo(
    () => adjustmentAccounts.find((account) => account.id === adjustmentAccountId),
    [adjustmentAccountId, adjustmentAccounts],
  );
  const suggestedAdjustmentAccount = useMemo(() => {
    if (!requiresAdjustmentAccount) return undefined;

    return adjustmentAccounts.find((account) => preferredAdjustmentAccountTypes.includes(account.type))
      ?? adjustmentAccounts[0];
  }, [adjustmentAccounts, preferredAdjustmentAccountTypes, requiresAdjustmentAccount]);

  useEffect(() => {
    if (!requiresAdjustmentAccount) {
      if (adjustmentAccountId) {
        setValue('adjustment_account_id', '', { shouldValidate: true });
      }
      autoSelectedAdjustmentAccountId.current = null;
      return;
    }

    if (!suggestedAdjustmentAccount) return;

    const selectedWasAuto = autoSelectedAdjustmentAccountId.current === adjustmentAccountId;
    const selectedIsPreferred = selectedAdjustmentAccount
      ? preferredAdjustmentAccountTypes.includes(selectedAdjustmentAccount.type)
      : false;
    if (!adjustmentAccountId || (selectedWasAuto && !selectedIsPreferred)) {
      autoSelectedAdjustmentAccountId.current = suggestedAdjustmentAccount.id;
      setValue('adjustment_account_id', suggestedAdjustmentAccount.id, { shouldValidate: true });
    }
  }, [
    adjustmentAccountId,
    preferredAdjustmentAccountTypes,
    requiresAdjustmentAccount,
    selectedAdjustmentAccount,
    setValue,
    suggestedAdjustmentAccount,
  ]);

  const handleFormSubmit = async (values: CashBankReconciliationFormData) => {
    await createReconciliation(values);
    reset({
      ...values,
      statement_reference: '',
      statement_ending_balance: 0,
      selected_transaction_ids: [],
      adjustment_account_id: '',
      notes: '',
    });
  };

  const confirmVoid = async () => {
    if (!voidTarget) return;

    await voidReconciliation({
      reconciliationId: voidTarget.id,
      reason: voidReason,
    });
    setVoidTarget(null);
    setVoidReason('');
  };

  const transactionColumns: ColumnsType<FinanceTransaction & { signed_amount: number }> = [
    {
      title: 'Tanggal',
      dataIndex: 'created_at',
      width: 150,
      render: (value: string) => formatDate(value),
    },
    {
      title: 'Kategori',
      dataIndex: 'category',
      width: 180,
      render: (category: string) => <Tag color="blue">{getFinanceCategoryLabel(category, t)}</Tag>,
    },
    {
      title: 'Deskripsi',
      dataIndex: 'description',
      render: (value: string, record) => (
        <div>
          <div className="font-medium text-gray-900">{value}</div>
          {record.reference_id && <div className="text-xs text-gray-500">Ref: {record.reference_id}</div>}
        </div>
      ),
    },
    {
      title: 'Tipe',
      key: 'type',
      width: 120,
      render: (_, record) => {
        const businessType = getFinanceTransactionBusinessType(record);
        return businessType === 'EXPENSE'
          ? <Tag color="red">Keluar</Tag>
          : <Tag color="green">Masuk</Tag>;
      },
    },
    {
      title: 'Nominal',
      dataIndex: 'signed_amount',
      align: 'right',
      width: 160,
      render: (value: number) => (
        <span className={value < 0 ? 'font-semibold text-red-600' : 'font-semibold text-green-600'}>
          {value < 0 ? '-' : '+'} {money(Math.abs(value))}
        </span>
      ),
    },
  ];

  const historyColumns: ColumnsType<CashBankReconciliation> = [
    {
      title: 'Tanggal Statement',
      dataIndex: 'statement_date',
      width: 150,
      render: (value: string) => formatDate(value),
    },
    {
      title: 'Nomor',
      dataIndex: 'reconciliation_number',
      width: 170,
      render: (value: string, record) => (
        <div>
          <div className="font-medium">{value}</div>
          {record.statement_reference && <div className="text-xs text-gray-500">{record.statement_reference}</div>}
        </div>
      ),
    },
    {
      title: 'Akun',
      key: 'account',
      render: (_, record) => `${record.cash_account_code ?? ''} ${record.cash_account_name}`.trim(),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      width: 110,
      render: (status: CashBankReconciliation['status']) => getStatusTag(status),
    },
    {
      title: 'Cleared',
      dataIndex: 'cleared_balance_amount',
      align: 'right',
      width: 150,
      render: (value: number) => money(value),
    },
    {
      title: 'Statement',
      dataIndex: 'statement_ending_balance',
      align: 'right',
      width: 150,
      render: (value: number) => money(value),
    },
    {
      title: 'Selisih',
      dataIndex: 'difference_amount',
      align: 'right',
      width: 140,
      render: (value: number) => (
        <div className="text-right">
          <div className={Math.abs(value) <= 0.01 ? 'text-green-600' : 'text-orange-600'}>
            {money(value)}
          </div>
        </div>
      ),
    },
    {
      title: '',
      key: 'actions',
      width: 100,
      render: (_, record) => (
        record.status === 'VOIDED' ? null : (
          <Button
            size="small"
            icon={<RotateCcw size={14} />}
            onClick={() => setVoidTarget(record)}
          >
            Void
          </Button>
        )
      ),
    },
  ];

  const candidateRows = (candidates?.rows ?? []).map((row) => ({
    ...row.transaction,
    signed_amount: row.signed_amount,
  }));

  return (
    <div className="space-y-4 p-3 sm:p-4 md:p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <Title level={2} style={{ margin: 0 }}>Rekonsiliasi Cash & Bank</Title>
          <Text type="secondary">Cocokkan transaksi kas/bank operasional dengan saldo statement.</Text>
        </div>
        <Button href="/finance/cash-flow" icon={<ArrowLeft size={16} />}>
          Kembali
        </Button>
      </div>

      {cashBankAccounts.length === 0 && !isLoadingCashBankAccounts && (
        <Alert
          type="info"
          showIcon
          message="Belum ada akun kas/bank dengan transaksi."
          description="Catat transaksi Cash & Bank terlebih dahulu agar akun muncul untuk direkonsiliasi."
        />
      )}

      <Form layout="vertical" component={false}>
        <form className="space-y-4" onSubmit={handleSubmit(handleFormSubmit)}>
          <Card
            title={
              <div className="flex items-center gap-2">
                <Scale size={18} />
                <span>Statement</span>
              </div>
            }
          >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Form.Item
                label="Akun kas/bank"
                required
                validateStatus={errors.cash_account_id ? 'error' : undefined}
                help={errors.cash_account_id?.message}
              >
                <Controller
                  control={control}
                  name="cash_account_id"
                  render={({ field }) => (
                    <Select
                      {...field}
                      data-testid="cash-bank-reconciliation-account-select"
                      showSearch
                      loading={isLoadingCashBankAccounts}
                      optionFilterProp="label"
                      placeholder="Pilih akun kas/bank"
                      options={accountOptions}
                    />
                  )}
                />
              </Form.Item>

              <Form.Item
                label="Tanggal statement"
                required
                validateStatus={errors.statement_date ? 'error' : undefined}
                help={errors.statement_date?.message}
              >
                <Controller
                  control={control}
                  name="statement_date"
                  render={({ field }) => (
                    <DatePicker
                      data-testid="cash-bank-reconciliation-statement-date"
                      className="w-full"
                      value={field.value ? dayjs(field.value) : undefined}
                      onChange={(value) => field.onChange(value?.toISOString() ?? '')}
                    />
                  )}
                />
              </Form.Item>

              <Form.Item
                label="Saldo akhir statement"
                required
                validateStatus={errors.statement_ending_balance ? 'error' : undefined}
                help={errors.statement_ending_balance?.message}
              >
                <Controller
                  control={control}
                  name="statement_ending_balance"
                  render={({ field }) => (
                    <InputNumber
                      data-testid="cash-bank-reconciliation-statement-balance"
                      className="w-full"
                      inputMode="numeric"
                      precision={0}
                      value={field.value}
                      onChange={(value) => field.onChange(Number(value || 0))}
                    />
                  )}
                />
              </Form.Item>

              <Form.Item
                label="Nomor/reference statement"
                validateStatus={errors.statement_reference ? 'error' : undefined}
                help={errors.statement_reference?.message}
              >
                <Controller
                  control={control}
                  name="statement_reference"
                  render={({ field }) => (
                    <Input
                      {...field}
                      data-testid="cash-bank-reconciliation-statement-reference"
                      value={field.value ?? ''}
                      placeholder="Opsional"
                    />
                  )}
                />
              </Form.Item>

              {requiresAdjustmentAccount && (
                <Form.Item
                  label="Akun penyesuaian selisih"
                  required
                  validateStatus={!adjustmentAccountId ? 'error' : undefined}
                  help={!adjustmentAccountId ? 'Pilih akun COA untuk jurnal penyesuaian selisih.' : undefined}
                >
                  <Controller
                    control={control}
                    name="adjustment_account_id"
                    render={({ field }) => (
                      <Select
                        {...field}
                        data-testid="cash-bank-reconciliation-adjustment-account"
                        showSearch
                        loading={isLoadingAdjustmentAccounts}
                        optionFilterProp="label"
                        placeholder="Pilih akun penyesuaian"
                        options={adjustmentAccountOptions}
                      />
                    )}
                  />
                </Form.Item>
              )}
            </div>

            <Form.Item
              label="Catatan"
              validateStatus={errors.notes ? 'error' : undefined}
              help={errors.notes?.message}
            >
              <Controller
                control={control}
                name="notes"
                render={({ field }) => (
                  <Input.TextArea
                    {...field}
                    data-testid="cash-bank-reconciliation-notes"
                    value={field.value ?? ''}
                    rows={2}
                    placeholder="Opsional"
                  />
                )}
              />
            </Form.Item>
          </Card>

          <Card title="Ringkasan">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
              <div className="rounded-md border border-gray-100 bg-gray-50 p-3">
                <div className="text-xs text-gray-500">Saldo buku s/d statement</div>
                <div className="text-lg font-semibold" data-testid="cash-bank-reconciliation-book-balance">
                  {money(candidates?.book_balance_amount ?? 0)}
                </div>
              </div>
              <div className="rounded-md border border-gray-100 bg-gray-50 p-3">
                <div className="text-xs text-gray-500">Saldo cleared setelah pilihan</div>
                <div className="text-lg font-semibold" data-testid="cash-bank-reconciliation-cleared-balance">
                  {money(clearedBalance)}
                </div>
              </div>
              <div className="rounded-md border border-gray-100 bg-gray-50 p-3">
                <div className="text-xs text-gray-500">Total transaksi dipilih</div>
                <div className="text-lg font-semibold" data-testid="cash-bank-reconciliation-selected-total">
                  {money(selectedTotal)}
                </div>
              </div>
              <div className="rounded-md border border-gray-100 bg-gray-50 p-3">
                <div className="text-xs text-gray-500">Selisih statement</div>
                <div
                  className={`text-lg font-semibold ${Math.abs(differenceAmount) <= 0.01 ? 'text-green-600' : 'text-orange-600'}`}
                  data-testid="cash-bank-reconciliation-difference"
                >
                  {money(differenceAmount)}
                </div>
              </div>
            </div>
          </Card>

          <Card
            title="Transaksi belum direkonsiliasi"
            extra={
              <Tag color={Math.abs(differenceAmount) <= 0.01 ? 'green' : 'orange'}>
                {Math.abs(differenceAmount) <= 0.01 ? 'Balanced' : 'Selisih'}
              </Tag>
            }
          >
            <Form.Item
              validateStatus={errors.selected_transaction_ids ? 'error' : undefined}
              help={errors.selected_transaction_ids?.message}
            >
              <Table
                data-testid="cash-bank-reconciliation-candidate-table"
                rowKey="id"
                dataSource={candidateRows}
                columns={transactionColumns}
                loading={isLoadingCandidates}
                pagination={{ pageSize: 10 }}
                scroll={{ x: 900 }}
                onRow={(record) => ({
                  className: 'cash-bank-reconciliation-candidate-row',
                  'data-testid': `cash-bank-reconciliation-candidate-row-${record.id}`,
                })}
                rowSelection={{
                  selectedRowKeys: selectedTransactionIds,
                  onChange: (keys) => {
                    setValue('selected_transaction_ids', keys.map(String), { shouldValidate: true });
                  },
                }}
                locale={{
                  emptyText: cashAccountId
                    ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Tidak ada transaksi kandidat." />
                    : 'Pilih akun kas/bank terlebih dahulu.',
                }}
              />
            </Form.Item>

            <div className="flex justify-end">
              <Button
                data-testid="cash-bank-reconciliation-save-button"
                type="primary"
                htmlType="submit"
                icon={<Save size={16} />}
                loading={isCreatingReconciliation}
                disabled={!cashAccountId || (requiresAdjustmentAccount && !adjustmentAccountId)}
              >
                Simpan Rekonsiliasi
              </Button>
            </div>
          </Card>
        </form>
      </Form>

      <Card
        title={
          <div className="flex items-center gap-2">
            <CheckCircle2 size={18} />
            <span>History Rekonsiliasi</span>
          </div>
        }
      >
        <Table
          data-testid="cash-bank-reconciliation-history-table"
          rowKey="id"
          dataSource={reconciliations}
          columns={historyColumns}
          loading={isLoadingReconciliations}
          pagination={{ pageSize: 10 }}
          scroll={{ x: 980 }}
          onRow={(record) => ({
            className: 'cash-bank-reconciliation-history-row',
            'data-testid': `cash-bank-reconciliation-history-row-${record.id}`,
          })}
        />
      </Card>

      <Modal
        title="Void Rekonsiliasi"
        open={Boolean(voidTarget)}
        onCancel={() => {
          setVoidTarget(null);
          setVoidReason('');
        }}
        onOk={() => {
          if (!voidReason.trim()) {
            modal.warning({ title: 'Alasan wajib diisi' });
            return;
          }
          void confirmVoid();
        }}
        confirmLoading={isVoidingReconciliation}
        okButtonProps={{ danger: true }}
        okText="Void"
        cancelText="Batal"
      >
        <div className="space-y-3">
          <Text>
            Transaksi pada rekonsiliasi {voidTarget?.reconciliation_number} akan dibuka kembali sebagai kandidat.
          </Text>
          <Input.TextArea
            data-testid="cash-bank-reconciliation-void-reason"
            rows={3}
            value={voidReason}
            onChange={(event) => setVoidReason(event.target.value)}
            placeholder="Alasan void"
          />
        </div>
      </Modal>
    </div>
  );
}
