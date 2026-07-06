import { useState } from 'react';
import {
  Alert,
  App,
  Button,
  Card,
  DatePicker,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { Dayjs } from 'dayjs';
import { useQuery } from '@tanstack/react-query';
import { useLiveQuery } from 'dexie-react-hooks';
import { CheckCircle2, Lock, Unlock, Plus, XCircle } from 'lucide-react';
import { db } from '@/lib/db';
import {
  createAccountingPeriod,
  deleteAccountingPeriod,
  lockAccountingPeriod,
  unlockAccountingPeriod,
} from '@/services/accountingPeriodService';
import {
  getClosingPreview,
  postClosingRun,
  reopenClosedPeriod,
} from '@/services/closingRunService';
import { hasPermission } from '@/auth/permissions';
import { useAuth } from '@/auth/useAuth';
import { useI18n } from '@/hooks/useI18n';
import { formatCurrency, formatDate } from '@/utils/formatters';
import type { AccountingPeriod, AccountingPeriodStatus, AccountingPeriodType, ClosingRun } from '@/types';

const { Text, Title } = Typography;

const statusColor: Record<AccountingPeriodStatus, string> = {
  OPEN: 'green',
  LOCKED: 'gold',
  CLOSED: 'red',
};

interface CreatePeriodFormValues {
  name: string;
  period_type: AccountingPeriodType;
  start_date: Dayjs;
  end_date: Dayjs;
  notes?: string;
}

function ClosingManagement() {
  const { t } = useI18n();
  const { currentUser } = useAuth();
  const { message, modal } = App.useApp();
  const [form] = Form.useForm<CreatePeriodFormValues>();

  const canManagePeriod = hasPermission(currentUser?.role, 'ACCOUNTING_PERIOD_MANAGE');
  const canClose = hasPermission(currentUser?.role, 'PERIOD_CLOSE');
  const canReopen = hasPermission(currentUser?.role, 'PERIOD_REOPEN');

  const [submitting, setSubmitting] = useState(false);
  const [previewPeriodId, setPreviewPeriodId] = useState<string | undefined>();
  const [reopenPeriod, setReopenPeriod] = useState<AccountingPeriod | undefined>();
  const [reopenReason, setReopenReason] = useState('');

  const periods = useLiveQuery(async () => {
    const rows = await db.accountingPeriods.toArray();
    return rows
      .filter((period) => !period.deleted_at)
      .sort((a, b) => (a.start_date < b.start_date ? 1 : -1));
  }, [], [] as AccountingPeriod[]);

  const closingRuns = useLiveQuery(async () => {
    const rows = await db.closingRuns.toArray();
    return rows
      .filter((run) => !run.deleted_at)
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  }, [], [] as ClosingRun[]);

  const previewQuery = useQuery({
    queryKey: ['closingPreview', previewPeriodId],
    queryFn: () => getClosingPreview(previewPeriodId as string),
    enabled: Boolean(previewPeriodId),
  });

  const runAction = async (action: () => Promise<unknown>, successMessage: string) => {
    setSubmitting(true);
    try {
      await action();
      message.success(successMessage);
    } catch (error) {
      modal.error({ title: 'Gagal', content: (error as Error).message });
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreate = async (values: CreatePeriodFormValues) => {
    await runAction(async () => {
      const created = await createAccountingPeriod({
        name: values.name,
        period_type: values.period_type,
        start_date: values.start_date.toISOString(),
        end_date: values.end_date.toISOString(),
        notes: values.notes,
      });
      form.resetFields();
      return created;
    }, t('closing.message.periodCreated').replace('{name}', values.name));
  };

  const handlePostClosing = async () => {
    if (!previewPeriodId) return;
    await runAction(async () => {
      await postClosingRun({ period_id: previewPeriodId });
      setPreviewPeriodId(undefined);
    }, t('closing.message.closingPosted'));
  };

  const handleReopen = async () => {
    if (!reopenPeriod) return;
    await runAction(async () => {
      await reopenClosedPeriod({ period_id: reopenPeriod.id, reason: reopenReason });
      setReopenPeriod(undefined);
      setReopenReason('');
    }, t('closing.message.reopened'));
  };

  const periodColumns: ColumnsType<AccountingPeriod> = [
    { title: t('closing.period.name'), dataIndex: 'name' },
    {
      title: t('closing.period.type'),
      dataIndex: 'period_type',
      render: (value: AccountingPeriodType) => (
        value === 'YEARLY' ? t('closing.period.typeYearly') : t('closing.period.typeMonthly')
      ),
    },
    {
      title: t('closing.period.startDate'),
      dataIndex: 'start_date',
      render: (value: string) => formatDate(value),
    },
    {
      title: t('closing.period.endDate'),
      dataIndex: 'end_date',
      render: (value: string) => formatDate(value),
    },
    {
      title: t('closing.period.status'),
      dataIndex: 'status',
      render: (value: AccountingPeriodStatus) => (
        <Tag color={statusColor[value]}>{t(`closing.status.${value}`)}</Tag>
      ),
    },
    {
      title: t('closing.period.actions'),
      key: 'actions',
      render: (_, period) => (
        <Space wrap size="small">
          {canManagePeriod && period.status === 'OPEN' && (
            <Button size="small" icon={<Lock size={14} />} onClick={() => runAction(
              () => lockAccountingPeriod(period.id),
              t('closing.message.periodLocked'),
            )}>
              {t('closing.period.lock')}
            </Button>
          )}
          {canManagePeriod && period.status === 'LOCKED' && (
            <Button size="small" icon={<Unlock size={14} />} onClick={() => runAction(
              () => unlockAccountingPeriod(period.id),
              t('closing.message.periodUnlocked'),
            )}>
              {t('closing.period.unlock')}
            </Button>
          )}
          {canClose && period.status === 'LOCKED' && (
            <Button size="small" type="primary" onClick={() => setPreviewPeriodId(period.id)}>
              {t('closing.period.close')}
            </Button>
          )}
          {canReopen && period.status === 'CLOSED' && (
            <Button size="small" danger onClick={() => setReopenPeriod(period)}>
              {t('closing.period.reopen')}
            </Button>
          )}
          {canManagePeriod && period.status === 'OPEN' && (
            <Popconfirm
              title={t('closing.period.delete')}
              onConfirm={() => runAction(
                () => deleteAccountingPeriod(period.id),
                t('closing.message.periodDeleted'),
              )}
            >
              <Button size="small" danger type="text">{t('closing.period.delete')}</Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  const runColumns: ColumnsType<ClosingRun> = [
    { title: t('closing.runs.periodName'), dataIndex: 'period_name' },
    {
      title: t('closing.runs.netIncome'),
      dataIndex: 'net_income_amount',
      align: 'right',
      render: (value: number) => formatCurrency(value),
    },
    {
      title: t('closing.runs.status'),
      dataIndex: 'status',
      render: (value: ClosingRun['status']) => (
        <Tag color={value === 'POSTED' ? 'green' : value === 'REVERSED' ? 'red' : 'default'}>{value}</Tag>
      ),
    },
    {
      title: t('closing.runs.postedAt'),
      dataIndex: 'posted_at',
      render: (value?: string) => (value ? formatDate(value) : '-'),
    },
  ];

  const preview = previewQuery.data;

  return (
    <div className="p-3 sm:p-4 md:p-6 space-y-4">
      <div>
        <Title level={3} className="!mb-1">{t('closing.title')}</Title>
        <Text type="secondary">{t('closing.subtitle')}</Text>
      </div>

      <Tabs
        items={[
          {
            key: 'periods',
            label: t('closing.tabs.periods'),
            children: (
              <div className="space-y-4">
                {canManagePeriod && (
                  <Card size="small" title={t('closing.period.create')}>
                    <Form
                      form={form}
                      layout="vertical"
                      onFinish={handleCreate}
                      initialValues={{ period_type: 'YEARLY' as AccountingPeriodType }}
                    >
                      <div className="grid gap-3 md:grid-cols-2">
                        <Form.Item
                          name="name"
                          label={t('closing.period.name')}
                          rules={[{ required: true }]}
                        >
                          <Input placeholder="Tahun Buku 2026" data-testid="gl-closing-period-name" />
                        </Form.Item>
                        <Form.Item name="period_type" label={t('closing.period.type')}>
                          <Select
                            options={[
                              { value: 'YEARLY', label: t('closing.period.typeYearly') },
                              { value: 'MONTHLY', label: t('closing.period.typeMonthly') },
                            ]}
                          />
                        </Form.Item>
                        <Form.Item
                          name="start_date"
                          label={t('closing.period.startDate')}
                          rules={[{ required: true }]}
                        >
                          <DatePicker className="w-full" data-testid="gl-closing-start-date" format="YYYY-MM-DD" />
                        </Form.Item>
                        <Form.Item
                          name="end_date"
                          label={t('closing.period.endDate')}
                          rules={[{ required: true }]}
                        >
                          <DatePicker className="w-full" data-testid="gl-closing-end-date" format="YYYY-MM-DD" />
                        </Form.Item>
                        <Form.Item name="notes" label={t('closing.period.notes')}>
                          <Input.TextArea rows={1} />
                        </Form.Item>
                      </div>
                      <Button
                        type="primary"
                        htmlType="submit"
                        icon={<Plus size={16} />}
                        loading={submitting}
                        data-testid="gl-closing-create-period"
                      >
                        {t('closing.period.create')}
                      </Button>
                    </Form>
                  </Card>
                )}

                <Card size="small">
                  <Table<AccountingPeriod>
                    rowKey="id"
                    size="small"
                    columns={periodColumns}
                    dataSource={periods ?? []}
                    locale={{ emptyText: t('closing.period.empty') }}
                    pagination={false}
                  />
                </Card>
              </div>
            ),
          },
          {
            key: 'runs',
            label: t('closing.tabs.runs'),
            children: (
              <Card size="small">
                <Table<ClosingRun>
                  rowKey="id"
                  size="small"
                  columns={runColumns}
                  dataSource={closingRuns ?? []}
                  locale={{ emptyText: t('closing.runs.empty') }}
                  pagination={false}
                />
              </Card>
            ),
          },
        ]}
      />

      <Modal
        title={t('closing.preview.title')}
        open={Boolean(previewPeriodId)}
        onCancel={() => setPreviewPeriodId(undefined)}
        width={760}
        footer={[
          <Button key="cancel" onClick={() => setPreviewPeriodId(undefined)}>
            {t('common.cancel')}
          </Button>,
          <Button
            key="post"
            type="primary"
            danger
            loading={submitting}
            disabled={!preview?.can_post || !preview?.preview.is_balanced}
            onClick={handlePostClosing}
            data-testid="gl-closing-post"
          >
            {t('closing.preview.post')}
          </Button>,
        ]}
      >
        {previewQuery.isLoading && <Text type="secondary">Loading...</Text>}
        {previewQuery.isError && (
          <Alert type="error" showIcon message={(previewQuery.error as Error).message} />
        )}
        {preview && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <StatBox label={t('closing.preview.netIncome')} value={formatCurrency(preview.preview.net_income_amount)} />
              <StatBox label={t('closing.preview.totalRevenue')} value={formatCurrency(preview.preview.total_revenue_amount)} />
              <StatBox label={t('closing.preview.totalContraRevenue')} value={formatCurrency(preview.preview.total_contra_revenue_amount)} />
              <StatBox label={t('closing.preview.totalExpense')} value={formatCurrency(preview.preview.total_expense_amount)} />
            </div>

            <Text type="secondary">
              {t('closing.preview.retainedAccount')}: {preview.preview.retained_earning_account_code} - {preview.preview.retained_earning_account_name}
            </Text>

            <Alert
              type={preview.preview.is_balanced ? 'success' : 'error'}
              showIcon
              message={preview.preview.is_balanced ? t('closing.preview.balanced') : t('closing.preview.notBalanced')}
            />

            <div>
              <Text strong>{t('closing.preview.prechecks')}</Text>
              <ul className="mt-1 space-y-1">
                {preview.prechecks.map((precheck) => (
                  <li key={precheck.key} className="flex items-center gap-2 text-sm">
                    {precheck.ok
                      ? <CheckCircle2 size={15} className="text-green-600" />
                      : <XCircle size={15} className={precheck.blocking ? 'text-red-600' : 'text-amber-500'} />}
                    <span>{precheck.message}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <Text strong>{t('closing.preview.journalLines')}</Text>
              <Table
                rowKey={(row) => `${row.account_id}-${row.debit}-${row.credit}`}
                size="small"
                className="mt-1"
                pagination={false}
                columns={[
                  { title: 'Akun', render: (_, row) => `${row.account_code} - ${row.account_name}` },
                  { title: 'Debit', dataIndex: 'debit', align: 'right', render: (v: number) => (v ? formatCurrency(v) : '-') },
                  { title: 'Kredit', dataIndex: 'credit', align: 'right', render: (v: number) => (v ? formatCurrency(v) : '-') },
                ]}
                dataSource={preview.preview.lines}
              />
            </div>

            {!preview.can_post && (
              <Alert type="warning" showIcon message={t('closing.preview.cannotPost')} />
            )}
          </div>
        )}
      </Modal>

      <Modal
        title={t('closing.reopen.title')}
        open={Boolean(reopenPeriod)}
        onCancel={() => { setReopenPeriod(undefined); setReopenReason(''); }}
        onOk={handleReopen}
        okText={t('closing.reopen.confirm')}
        okButtonProps={{ danger: true, loading: submitting, disabled: !reopenReason.trim() }}
      >
        <Form layout="vertical">
          <Form.Item label={t('closing.reopen.reason')} required>
            <Input.TextArea
              rows={3}
              value={reopenReason}
              onChange={(event) => setReopenReason(event.target.value)}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 p-2 dark:border-slate-700">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-sm font-semibold">{value}</div>
    </div>
  );
}

export default ClosingManagement;
