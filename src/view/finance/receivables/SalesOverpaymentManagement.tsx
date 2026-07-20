import { useEffect, useMemo, useState } from 'react';
import { Button, Card, DatePicker, Drawer, Form, Input, InputNumber, Modal, Radio, Select, Space, Table, Tag, Typography } from 'antd';
import type { Dayjs } from 'dayjs';
import type { ColumnsType } from 'antd/es/table';
import { Link } from '@tanstack/react-router';
import { ArrowLeft, Banknote, Eye, RefreshCcw, Search, Shuffle } from 'lucide-react';
import dayjs from '@/lib/dayjs';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { useI18n } from '@/hooks/useI18n';
import { useSalesOverpayments } from '@/hooks/useSalesOverpayments';
import type {
  AccountsReceivableRow,
  SalesOverpaymentRow,
  SalesOverpaymentSettlement,
  SalesOverpaymentSettlementAllocation,
  SalesOverpaymentSettlementMethod,
  SalesOverpaymentStatus,
} from '@/types';
import { formatCurrency, formatDate } from '@/utils/formatters';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

const statusColor: Record<SalesOverpaymentStatus, string> = {
  OPEN: 'green',
  PARTIALLY_USED: 'gold',
  SETTLED: 'blue',
  CANCELLED: 'red',
};

const methodColor: Record<SalesOverpaymentSettlementMethod, string> = {
  INVOICE_ALLOCATION: 'blue',
  CASH_REFUND: 'red',
};

interface SettlementModalProps {
  open: boolean;
  row?: SalesOverpaymentRow;
  loading?: boolean;
  listTargets: (sourcePaymentId: string) => Promise<AccountsReceivableRow[]>;
  onAllocate: (input: {
    sourcePaymentId: string;
    settlement_date?: string;
    description?: string;
    department_id?: string;
    project_id?: string;
    notes?: string;
    allocations: Array<{ target_sales_document_id: string; amount: number }>;
  }) => Promise<void>;
  onRefund: (input: {
    sourcePaymentId: string;
    settlement_date?: string;
    description?: string;
    cash_account_id: string;
    amount: number;
    department_id?: string;
    project_id?: string;
    notes?: string;
  }) => Promise<void>;
  onCancel: () => void;
}

interface SettlementFormValues {
  method: SalesOverpaymentSettlementMethod;
  settlement_date: Dayjs;
  description?: string;
  department_id?: string;
  project_id?: string;
  cash_account_id?: string;
  refund_amount?: number;
  notes?: string;
}

const money = (value: number) => `Rp ${formatCurrency(value || 0)}`;

function SettlementModal({
  open,
  row,
  loading,
  listTargets,
  onAllocate,
  onRefund,
  onCancel,
}: SettlementModalProps) {
  const { t } = useI18n();
  const [form] = Form.useForm<SettlementFormValues>();
  const [targets, setTargets] = useState<AccountsReceivableRow[]>([]);
  const [allocationAmounts, setAllocationAmounts] = useState<Record<string, number>>({});
  const paymentAccounts = useLiveQuery(
    () => db.chartOfAccounts
      .where('type')
      .equals('ASSET')
      .filter((account) => account.is_active && account.is_postable)
      .toArray(),
    [],
    [],
  );
  const departments = useLiveQuery(
    () => db.departments.filter((department) => department.is_active).toArray(),
    [],
    [],
  );
  const projects = useLiveQuery(
    () => db.projects.filter((project) => project.is_active).toArray(),
    [],
    [],
  );
  const selectedMethod = Form.useWatch('method', form) ?? 'INVOICE_ALLOCATION';
  const selectedCashAccountId = Form.useWatch('cash_account_id', form);
  const refundAmount = Number(Form.useWatch('refund_amount', form) || 0);
  const totalAllocation = useMemo(() => (
    Object.values(allocationAmounts).reduce((sum, amount) => sum + Number(amount || 0), 0)
  ), [allocationAmounts]);
  const remainingAmount = row?.remaining_amount ?? 0;
  const isSubmitDisabled = !row || remainingAmount <= 0.01 || (
    selectedMethod === 'INVOICE_ALLOCATION'
      ? targets.length === 0 || totalAllocation <= 0.01 || totalAllocation > remainingAmount + 0.01
      : !selectedCashAccountId || refundAmount <= 0 || refundAmount > remainingAmount + 0.01 || paymentAccounts.length === 0
  );

  useEffect(() => {
    if (!open || !row) return;
    form.setFieldsValue({
      method: 'INVOICE_ALLOCATION',
      settlement_date: dayjs(),
      description: `Penyelesaian lebih bayar ${row.payment_number}`,
      refund_amount: row.remaining_amount,
      cash_account_id: undefined,
      department_id: undefined,
      project_id: undefined,
      notes: undefined,
    });
    listTargets(row.payment_id).then(setTargets).catch(() => setTargets([]));
  }, [form, listTargets, open, row]);

  const handleSubmit = async (values: SettlementFormValues) => {
    if (!row) return;
    const commonInput = {
      sourcePaymentId: row.payment_id,
      settlement_date: values.settlement_date?.toISOString() ?? new Date().toISOString(),
      description: values.description,
      department_id: values.department_id,
      project_id: values.project_id,
      notes: values.notes,
    };

    if (values.method === 'INVOICE_ALLOCATION') {
      const allocations = Object.entries(allocationAmounts)
        .map(([target_sales_document_id, amount]) => ({
          target_sales_document_id,
          amount: Number(amount || 0),
        }))
        .filter((allocation) => allocation.amount > 0);
      await onAllocate({ ...commonInput, allocations });
    } else {
      await onRefund({
        ...commonInput,
        cash_account_id: values.cash_account_id ?? '',
        amount: Number(values.refund_amount || 0),
      });
    }

    form.resetFields();
    setAllocationAmounts({});
  };

  const allocationColumns: ColumnsType<AccountsReceivableRow> = [
    {
      title: t('accountsReceivable.invoiceNumber'),
      dataIndex: 'document_number',
      width: 160,
    },
    {
      title: t('accountsReceivable.invoiceDate'),
      dataIndex: 'document_date',
      width: 120,
      render: (value: string) => formatDate(value),
    },
    {
      title: t('accountsReceivable.dueDate'),
      dataIndex: 'due_date',
      width: 120,
      render: (value?: string) => value ? formatDate(value) : '-',
    },
    {
      title: t('accountsReceivable.totalInvoice'),
      dataIndex: 'total_amount',
      align: 'right',
      width: 140,
      render: (value: number) => money(value),
    },
    {
      title: t('accountsReceivable.balanceDue'),
      dataIndex: 'balance_due',
      align: 'right',
      width: 150,
      render: (value: number) => <span className="font-semibold text-rose-700">{money(value)}</span>,
    },
    {
      title: t('salesOverpayments.allocationAmount'),
      key: 'allocation',
      align: 'right',
      width: 170,
      render: (_, target) => (
        <InputNumber
          min={0}
          max={Math.min(target.balance_due, row?.remaining_amount ?? 0)}
          value={allocationAmounts[target.sales_document_id]}
          onChange={(value) => setAllocationAmounts((current) => ({
            ...current,
            [target.sales_document_id]: Number(value || 0),
          }))}
          style={{ width: '100%' }}
        />
      ),
    },
    {
      title: t('salesOverpayments.balanceAfter'),
      key: 'balanceAfter',
      align: 'right',
      width: 150,
      render: (_, target) => money(Math.max(0, target.balance_due - Number(allocationAmounts[target.sales_document_id] || 0))),
    },
  ];

  return (
    <Modal
      title={t('salesOverpayments.processTitle')}
      open={open}
      onCancel={onCancel}
      okText={t('salesOverpayments.process')}
      okButtonProps={{ loading, disabled: isSubmitDisabled }}
      width={920}
      onOk={() => form.submit()}
      destroyOnClose
    >
      {row && (
        <div className="mb-4 rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm">
          <div className="grid gap-2 md:grid-cols-4">
            <div>
              <Text type="secondary">{t('salesOverpayments.receiptNumber')}</Text>
              <div className="font-semibold">{row.payment_number}</div>
            </div>
            <div>
              <Text type="secondary">{t('accountsReceivable.customer')}</Text>
              <div className="font-semibold">{row.customer_name}</div>
            </div>
            <div>
              <Text type="secondary">{t('salesOverpayments.initialOverpayment')}</Text>
              <div className="font-semibold">{money(row.overpayment_amount)}</div>
            </div>
            <div>
              <Text type="secondary">{t('salesOverpayments.remainingOverpayment')}</Text>
              <div className="font-semibold text-emerald-700">{money(row.remaining_amount)}</div>
            </div>
          </div>
        </div>
      )}

      <Form form={form} layout="vertical" onFinish={handleSubmit}>
        <div className="grid gap-3 md:grid-cols-2">
          <Form.Item name="method" label={t('salesOverpayments.method')} rules={[{ required: true }]}>
            <Radio.Group
              optionType="button"
              buttonStyle="solid"
              options={[
                { value: 'INVOICE_ALLOCATION', label: t('salesOverpayments.method.invoiceAllocation') },
                { value: 'CASH_REFUND', label: t('salesOverpayments.method.cashRefund') },
              ]}
            />
          </Form.Item>
          <Form.Item
            name="settlement_date"
            label={t('salesOverpayments.settlementDate')}
            rules={[{ required: true, message: t('salesDocuments.validation.required', { field: t('salesOverpayments.settlementDate') }) }]}
          >
            <DatePicker showTime style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="department_id" label={t('salesDocuments.field.department')}>
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              options={departments.map((department) => ({
                value: department.id,
                label: `${department.code} - ${department.name}`,
              }))}
            />
          </Form.Item>
          <Form.Item name="project_id" label={t('salesDocuments.field.project')}>
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              options={projects.map((project) => ({
                value: project.id,
                label: `${project.code} - ${project.name}`,
              }))}
            />
          </Form.Item>
        </div>

        <Form.Item name="description" label={t('salesOverpayments.description')}>
          <Input />
        </Form.Item>

        {selectedMethod === 'INVOICE_ALLOCATION' ? (
          <div className="space-y-3">
            <Table
              size="small"
              rowKey="sales_document_id"
              columns={allocationColumns}
              dataSource={targets}
              locale={{ emptyText: t('salesOverpayments.emptyTargets') }}
              pagination={false}
              scroll={{ x: 980 }}
            />
            <div className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-sm">
              <span>{t('salesOverpayments.totalAllocated')}</span>
              <span className={totalAllocation > (row?.remaining_amount ?? 0) + 0.01 ? 'font-semibold text-red-600' : 'font-semibold text-gray-900'}>
                {money(totalAllocation)}
              </span>
            </div>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            <Form.Item
              name="cash_account_id"
              label={t('accountsReceivable.cashAccount')}
              rules={[{ required: true, message: t('salesDocuments.validation.required', { field: t('accountsReceivable.cashAccount') }) }]}
            >
              <Select
                showSearch
                optionFilterProp="label"
                options={paymentAccounts.map((account) => ({
                  value: account.id,
                  label: `${account.code} - ${account.name}`,
                }))}
              />
            </Form.Item>
            <Form.Item
              name="refund_amount"
              label={t('salesOverpayments.refundAmount')}
              rules={[
                { required: true, message: t('finance.amountRequired') },
                {
                  validator: async (_, value) => {
                    const amount = Number(value || 0);
                    if (amount <= 0) throw new Error(t('finance.amountMin'));
                    if (row && amount > row.remaining_amount + 0.01) {
                      throw new Error(t('salesOverpayments.error.amountExceedsRemaining'));
                    }
                  },
                },
              ]}
            >
              <InputNumber min={1} max={row?.remaining_amount} style={{ width: '100%' }} />
            </Form.Item>
          </div>
        )}

        <Form.Item name="notes" label={t('salesDocuments.field.notes')}>
          <Input.TextArea rows={3} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

interface DetailDrawerProps {
  row?: SalesOverpaymentRow;
  settlements: SalesOverpaymentSettlement[];
  allocations: SalesOverpaymentSettlementAllocation[];
  loading?: boolean;
  onClose: () => void;
  onReverse: (settlementId: string, reason: string) => Promise<void>;
}

function DetailDrawer({
  row,
  settlements,
  allocations,
  loading,
  onClose,
  onReverse,
}: DetailDrawerProps) {
  const { t } = useI18n();

  const handleReverse = (settlement: SalesOverpaymentSettlement) => {
    let reason = '';

    Modal.confirm({
      title: t('salesOverpayments.reverseTitle'),
      content: (
        <div className="space-y-3">
          <Text type="secondary">{t('salesOverpayments.reverseContent', { number: settlement.settlement_number })}</Text>
          <Input.TextArea rows={3} onChange={(event) => { reason = event.target.value; }} />
        </div>
      ),
      okButtonProps: { danger: true, loading },
      okText: t('salesOverpayments.reverse'),
      onOk: async () => {
        const normalizedReason = reason.trim();
        if (!normalizedReason) throw new Error(t('salesOverpayments.reverseReasonRequired'));
        await onReverse(settlement.id, normalizedReason);
      },
    });
  };

  const detailSettlements = row
    ? settlements.filter((settlement) => settlement.source_payment_id === row.payment_id)
    : [];
  const allocationBySettlementId = allocations.reduce<Record<string, SalesOverpaymentSettlementAllocation[]>>((acc, allocation) => {
    acc[allocation.settlement_id] = acc[allocation.settlement_id] ?? [];
    acc[allocation.settlement_id].push(allocation);
    return acc;
  }, {});
  const columns: ColumnsType<SalesOverpaymentSettlement> = [
    {
      title: t('salesOverpayments.settlementNumber'),
      dataIndex: 'settlement_number',
      width: 170,
    },
    {
      title: t('salesOverpayments.settlementDate'),
      dataIndex: 'settlement_date',
      width: 130,
      render: (value: string) => formatDate(value),
    },
    {
      title: t('salesOverpayments.method'),
      dataIndex: 'method',
      width: 160,
      render: (value: SalesOverpaymentSettlementMethod) => (
        <Tag color={methodColor[value]}>{t(`salesOverpayments.method.${value}` as const)}</Tag>
      ),
    },
    {
      title: t('salesOverpayments.amount'),
      dataIndex: 'total_amount',
      align: 'right',
      width: 140,
      render: (value: number) => money(value),
    },
    {
      title: t('salesDocuments.table.status'),
      dataIndex: 'status',
      width: 120,
      render: (value: SalesOverpaymentSettlement['status']) => (
        <Tag color={value === 'POSTED' ? 'green' : 'red'}>{value}</Tag>
      ),
    },
    {
      title: '',
      key: 'action',
      width: 120,
      render: (_, settlement) => (
        <Button
          size="small"
          danger
          icon={<RefreshCcw size={14} />}
          disabled={settlement.status !== 'POSTED'}
          onClick={() => handleReverse(settlement)}
        >
          {t('salesOverpayments.reverse')}
        </Button>
      ),
    },
  ];

  return (
    <Drawer
      title={t('salesOverpayments.detailTitle')}
      open={Boolean(row)}
      onClose={onClose}
      width={820}
    >
      {row && (
        <div className="space-y-4">
          <div className="grid gap-3 rounded-lg border border-gray-100 bg-gray-50 p-3 text-sm md:grid-cols-3">
            <div>
              <Text type="secondary">{t('salesOverpayments.receiptNumber')}</Text>
              <div className="font-semibold">{row.payment_number}</div>
            </div>
            <div>
              <Text type="secondary">{t('accountsReceivable.customer')}</Text>
              <div className="font-semibold">{row.customer_name}</div>
            </div>
            <div>
              <Text type="secondary">{t('salesOverpayments.remainingOverpayment')}</Text>
              <div className="font-semibold text-emerald-700">{money(row.remaining_amount)}</div>
            </div>
          </div>

          <Table
            size="small"
            rowKey="id"
            columns={columns}
            dataSource={detailSettlements}
            loading={loading}
            expandable={{
              expandedRowRender: (settlement) => {
                const rows = allocationBySettlementId[settlement.id] ?? [];
                if (settlement.method === 'CASH_REFUND') {
                  return (
                    <div className="text-sm text-gray-600">
                      {settlement.cash_account_code && settlement.cash_account_name
                        ? `${settlement.cash_account_code} - ${settlement.cash_account_name}`
                        : '-'}
                    </div>
                  );
                }

                return (
                  <div className="space-y-1 text-sm">
                    {rows.map((allocation) => (
                      <div key={allocation.id} className="flex justify-between gap-3">
                        <span>{allocation.target_document_number}</span>
                        <span className="font-semibold">{money(allocation.allocation_amount)}</span>
                      </div>
                    ))}
                  </div>
                );
              },
            }}
            pagination={false}
          />
        </div>
      )}
    </Drawer>
  );
}

export default function SalesOverpaymentManagement() {
  const { t } = useI18n();
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState<SalesOverpaymentStatus | 'ALL'>('ALL');
  const [contactId, setContactId] = useState<string>();
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs]>();
  const [selectedProcessRow, setSelectedProcessRow] = useState<SalesOverpaymentRow>();
  const [selectedDetailRow, setSelectedDetailRow] = useState<SalesOverpaymentRow>();
  const contacts = useLiveQuery(
    () => db.contacts
      .filter((contact) => contact.is_active && (contact.contact_type === 'CUSTOMER' || contact.contact_type === 'CUSTOMER_SUPPLIER'))
      .toArray(),
    [],
    [],
  );
  const filters = useMemo(() => ({
    search: searchText,
    status: statusFilter,
    contactId,
    paidDateFrom: dateRange?.[0]?.format('YYYY-MM-DD'),
    paidDateTo: dateRange?.[1]?.format('YYYY-MM-DD'),
  }), [contactId, dateRange, searchText, statusFilter]);
  const {
    overpaymentRows,
    settlements,
    allocations,
    listTargets,
    allocateToInvoices,
    refundToCash,
    reverseSettlement,
    isMutating,
  } = useSalesOverpayments(filters);
  const summary = useMemo(() => overpaymentRows.reduce((acc, row) => {
    acc.initial += row.overpayment_amount;
    acc.used += row.used_amount;
    acc.remaining += row.remaining_amount;
    return acc;
  }, { initial: 0, used: 0, remaining: 0 }), [overpaymentRows]);

  const columns: ColumnsType<SalesOverpaymentRow> = [
    {
      title: t('salesOverpayments.receiptNumber'),
      dataIndex: 'payment_number',
      fixed: 'left',
      width: 180,
    },
    {
      title: t('salesOverpayments.receiptDate'),
      dataIndex: 'paid_at',
      width: 130,
      sorter: (left, right) => left.paid_at.localeCompare(right.paid_at),
      render: (value: string) => formatDate(value),
    },
    {
      title: t('accountsReceivable.customer'),
      dataIndex: 'customer_name',
      width: 190,
    },
    {
      title: t('salesOverpayments.sourceInvoice'),
      dataIndex: 'document_number',
      width: 170,
    },
    {
      title: t('salesOverpayments.totalPayment'),
      dataIndex: 'total_payment_amount',
      align: 'right',
      width: 150,
      render: (value: number) => money(value),
    },
    {
      title: t('salesOverpayments.allocatedPayment'),
      dataIndex: 'allocated_payment_amount',
      align: 'right',
      width: 170,
      render: (value: number) => money(value),
    },
    {
      title: t('salesOverpayments.initialOverpayment'),
      dataIndex: 'overpayment_amount',
      align: 'right',
      width: 170,
      render: (value: number) => money(value),
    },
    {
      title: t('salesOverpayments.usedOverpayment'),
      dataIndex: 'used_amount',
      align: 'right',
      width: 170,
      render: (value: number) => money(value),
    },
    {
      title: t('salesOverpayments.remainingOverpayment'),
      dataIndex: 'remaining_amount',
      align: 'right',
      width: 170,
      render: (value: number) => (
        <span className={value > 0 ? 'font-semibold text-emerald-700' : 'font-semibold text-gray-500'}>
          {money(value)}
        </span>
      ),
    },
    {
      title: t('salesDocuments.table.status'),
      dataIndex: 'status',
      width: 150,
      render: (value: SalesOverpaymentStatus) => (
        <Tag color={statusColor[value]}>{t(`salesOverpayments.status.${value}` as const)}</Tag>
      ),
    },
    {
      title: t('accountsReceivable.actions'),
      key: 'actions',
      fixed: 'right',
      width: 220,
      render: (_, row) => (
        <Space>
          {row.remaining_amount > 0.01 && (
            <Button
              size="small"
              type="primary"
              icon={<Shuffle size={14} />}
              onClick={() => setSelectedProcessRow(row)}
            >
              {t('salesOverpayments.process')}
            </Button>
          )}
          <Button size="small" icon={<Eye size={14} />} onClick={() => setSelectedDetailRow(row)}>
            {t('salesDocuments.detail')}
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div className="space-y-4 p-3 sm:p-4 md:p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <Title level={2} style={{ margin: 0 }}>{t('salesOverpayments.title')}</Title>
          <Text type="secondary">{t('salesOverpayments.subtitle')}</Text>
        </div>
        <Link to="/finance/receivables">
          <Button icon={<ArrowLeft size={16} />}>{t('salesOverpayments.backToReceivables')}</Button>
        </Link>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Card size="small">
          <Text type="secondary">{t('salesOverpayments.initialOverpayment')}</Text>
          <div className="text-lg font-semibold">{money(summary.initial)}</div>
        </Card>
        <Card size="small">
          <Text type="secondary">{t('salesOverpayments.usedOverpayment')}</Text>
          <div className="text-lg font-semibold">{money(summary.used)}</div>
        </Card>
        <Card size="small">
          <Text type="secondary">{t('salesOverpayments.remainingOverpayment')}</Text>
          <div className="text-lg font-semibold text-emerald-700">{money(summary.remaining)}</div>
        </Card>
      </div>

      <Card size="small">
        <div className="grid gap-2 lg:grid-cols-[minmax(220px,1fr)_190px_220px_250px_auto]">
          <Input
            allowClear
            prefix={<Search size={14} />}
            placeholder={t('salesOverpayments.searchPlaceholder')}
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
          />
          <Select
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { value: 'ALL', label: t('salesOverpayments.status.all') },
              { value: 'OPEN', label: t('salesOverpayments.status.OPEN') },
              { value: 'PARTIALLY_USED', label: t('salesOverpayments.status.PARTIALLY_USED') },
              { value: 'SETTLED', label: t('salesOverpayments.status.SETTLED') },
              { value: 'CANCELLED', label: t('salesOverpayments.status.CANCELLED') },
            ]}
          />
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder={t('accountsReceivable.customer')}
            value={contactId}
            onChange={setContactId}
            options={contacts.map((contact) => ({
              value: contact.id,
              label: contact.name,
            }))}
          />
          <RangePicker
            value={dateRange}
            onChange={(value) => setDateRange(value as [Dayjs, Dayjs] | undefined)}
            style={{ width: '100%' }}
          />
          <Button
            icon={<Banknote size={14} />}
            onClick={() => {
              setSearchText('');
              setStatusFilter('ALL');
              setContactId(undefined);
              setDateRange(undefined);
            }}
          >
            {t('common.reset')}
          </Button>
        </div>
      </Card>

      <Table
        rowKey="payment_id"
        columns={columns}
        dataSource={overpaymentRows}
        locale={{ emptyText: t('salesOverpayments.empty') }}
        scroll={{ x: 1700 }}
        pagination={{ pageSize: 10, showSizeChanger: true }}
      />

      <SettlementModal
        key={selectedProcessRow?.payment_id ?? 'closed'}
        open={Boolean(selectedProcessRow)}
        row={selectedProcessRow}
        loading={isMutating}
        listTargets={listTargets}
        onCancel={() => setSelectedProcessRow(undefined)}
        onAllocate={async (input) => {
          await allocateToInvoices(input);
          setSelectedProcessRow(undefined);
        }}
        onRefund={async (input) => {
          await refundToCash(input);
          setSelectedProcessRow(undefined);
        }}
      />

      <DetailDrawer
        row={selectedDetailRow}
        settlements={settlements}
        allocations={allocations}
        loading={isMutating}
        onClose={() => setSelectedDetailRow(undefined)}
        onReverse={async (settlementId, reason) => {
          await reverseSettlement({ settlementId, reason });
        }}
      />
    </div>
  );
}
