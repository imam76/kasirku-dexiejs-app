import { useState } from 'react';
import {
  Alert,
  App,
  Button,
  Card,
  DatePicker,
  Descriptions,
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
import { CheckCircle2, Lock, Plus, Unlock, XCircle } from 'lucide-react';
import { db } from '@/lib/db';
import {
  createAccountingPeriod,
  deleteAccountingPeriod,
  lockAccountingPeriod,
  unlockAccountingPeriod,
} from '@/services/accountingPeriodService';
import {
  getClosingPreview,
  getFiscalYearClosingPreview,
  postClosingRun,
  postFiscalYearClosingRun,
  reopenClosedFiscalYear,
  reopenClosedPeriod,
  type ClosingPrecheck,
} from '@/services/closingRunService';
import { hasPermission } from '@/auth/permissions';
import { useAuth } from '@/auth/useAuth';
import { useI18n } from '@/hooks/useI18n';
import { formatCurrency, formatDate } from '@/utils/formatters';
import type {
  AccountingFiscalYear,
  AccountingFiscalYearStatus,
  AccountingPeriod,
  AccountingPeriodStatus,
  AccountingPeriodType,
  ClosingRun,
  FiscalYearClosingRun,
} from '@/types';

const { Text, Title } = Typography;

const periodStatusColor: Record<AccountingPeriodStatus, string> = {
  OPEN: 'green',
  LOCKED: 'gold',
  CLOSED: 'red',
};

const fiscalYearStatusColor: Record<AccountingFiscalYearStatus, string> = {
  OPEN: 'green',
  CLOSED: 'red',
};

interface CreatePeriodFormValues {
  name: string;
  period_type: AccountingPeriodType;
  start_date: Dayjs;
  end_date: Dayjs;
  notes?: string;
}

type ReopenTarget =
  | { type: 'period'; record: AccountingPeriod }
  | { type: 'fiscalYear'; record: AccountingFiscalYear };

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
  const [previewFiscalYearId, setPreviewFiscalYearId] = useState<string | undefined>();
  const [reopenTarget, setReopenTarget] = useState<ReopenTarget | undefined>();
  const [reopenReason, setReopenReason] = useState('');

  const periods = useLiveQuery(async () => {
    const rows = await db.accountingPeriods.toArray();
    return rows
      .filter((period) => !period.deleted_at)
      .sort((a, b) => (a.start_date < b.start_date ? 1 : -1));
  }, [], [] as AccountingPeriod[]);

  const fiscalYears = useLiveQuery(async () => {
    const rows = await db.accountingFiscalYears.toArray();
    return rows
      .filter((fiscalYear) => !fiscalYear.deleted_at)
      .sort((a, b) => (a.start_date < b.start_date ? 1 : -1));
  }, [], [] as AccountingFiscalYear[]);

  const periodClosingRuns = useLiveQuery(async () => {
    const rows = await db.closingRuns.toArray();
    return rows
      .filter((run) => !run.deleted_at)
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  }, [], [] as ClosingRun[]);

  const fiscalYearClosingRuns = useLiveQuery(async () => {
    const rows = await db.fiscalYearClosingRuns.toArray();
    return rows
      .filter((run) => !run.deleted_at)
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  }, [], [] as FiscalYearClosingRun[]);

  const periodPreviewQuery = useQuery({
    queryKey: ['periodClosingPreview', previewPeriodId],
    queryFn: () => getClosingPreview(previewPeriodId as string),
    enabled: Boolean(previewPeriodId),
  });

  const fiscalYearPreviewQuery = useQuery({
    queryKey: ['fiscalYearClosingPreview', previewFiscalYearId],
    queryFn: () => getFiscalYearClosingPreview(previewFiscalYearId as string),
    enabled: Boolean(previewFiscalYearId),
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
      form.setFieldsValue({ period_type: 'MONTHLY' });
      return created;
    }, t('closing.message.periodCreated').replace('{name}', values.name));
  };

  const handlePostPeriodClosing = async () => {
    if (!previewPeriodId) return;
    await runAction(async () => {
      await postClosingRun({ period_id: previewPeriodId });
      setPreviewPeriodId(undefined);
    }, t('closing.message.periodClosingPosted'));
  };

  const handlePostFiscalYearClosing = async () => {
    if (!previewFiscalYearId) return;
    await runAction(async () => {
      await postFiscalYearClosingRun({ fiscal_year_id: previewFiscalYearId });
      setPreviewFiscalYearId(undefined);
    }, t('closing.message.fiscalYearClosingPosted'));
  };

  const handleReopen = async () => {
    if (!reopenTarget) return;
    await runAction(async () => {
      if (reopenTarget.type === 'period') {
        await reopenClosedPeriod({ period_id: reopenTarget.record.id, reason: reopenReason });
      } else {
        await reopenClosedFiscalYear({
          fiscal_year_id: reopenTarget.record.id,
          reason: reopenReason,
        });
      }
      setReopenTarget(undefined);
      setReopenReason('');
    }, reopenTarget.type === 'period'
      ? t('closing.message.periodReopened')
      : t('closing.message.fiscalYearReopened'));
  };

  const closeReopenModal = () => {
    setReopenTarget(undefined);
    setReopenReason('');
  };

  const periodColumns: ColumnsType<AccountingPeriod> = [
    { title: t('closing.period.name'), dataIndex: 'name' },
    {
      title: t('closing.period.type'),
      dataIndex: 'period_type',
      render: (value: AccountingPeriodType) => (
        value === 'YEARLY'
          ? <Tag color="default">{t('closing.period.typeYearlyLegacy')}</Tag>
          : t('closing.period.typeMonthly')
      ),
      width: 150,
    },
    {
      title: t('closing.period.startDate'),
      dataIndex: 'start_date',
      render: (value: string) => formatDate(value),
      width: 150,
    },
    {
      title: t('closing.period.endDate'),
      dataIndex: 'end_date',
      render: (value: string) => formatDate(value),
      width: 150,
    },
    {
      title: t('closing.period.status'),
      dataIndex: 'status',
      render: (value: AccountingPeriodStatus) => (
        <Tag color={periodStatusColor[value]}>{t(`closing.status.${value}`)}</Tag>
      ),
      width: 130,
    },
    {
      title: t('closing.period.actions'),
      key: 'actions',
      width: 360,
      render: (_, period) => (
        <Space wrap size="small">
          {canManagePeriod && period.status === 'OPEN' && (
            <Button
              size="small"
              icon={<Lock size={14} />}
              onClick={() => runAction(
                () => lockAccountingPeriod(period.id),
                t('closing.message.periodLocked'),
              )}
            >
              {t('closing.period.lock')}
            </Button>
          )}
          {canManagePeriod && period.status === 'LOCKED' && (
            <Button
              size="small"
              icon={<Unlock size={14} />}
              onClick={() => runAction(
                () => unlockAccountingPeriod(period.id),
                t('closing.message.periodUnlocked'),
              )}
            >
              {t('closing.period.unlock')}
            </Button>
          )}
          {canClose && period.status === 'LOCKED' && (
            <Button size="small" type="primary" onClick={() => setPreviewPeriodId(period.id)}>
              {t('closing.period.close')}
            </Button>
          )}
          {canReopen && period.status === 'CLOSED' && (
            <Button
              size="small"
              danger
              onClick={() => setReopenTarget({ type: 'period', record: period })}
            >
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

  const fiscalYearColumns: ColumnsType<AccountingFiscalYear> = [
    { title: t('closing.fiscalYear.name'), dataIndex: 'name' },
    {
      title: t('closing.fiscalYear.startDate'),
      dataIndex: 'start_date',
      render: (value: string) => formatDate(value),
      width: 150,
    },
    {
      title: t('closing.fiscalYear.endDate'),
      dataIndex: 'end_date',
      render: (value: string) => formatDate(value),
      width: 150,
    },
    {
      title: t('closing.fiscalYear.status'),
      dataIndex: 'status',
      render: (value: AccountingFiscalYearStatus) => (
        <Tag color={fiscalYearStatusColor[value]}>{t(`closing.fiscalYear.status.${value}`)}</Tag>
      ),
      width: 130,
    },
    {
      title: t('closing.fiscalYear.actions'),
      key: 'actions',
      width: 260,
      render: (_, fiscalYear) => (
        <Space wrap size="small">
          {canClose && fiscalYear.status === 'OPEN' && (
            <Button
              size="small"
              type="primary"
              onClick={() => setPreviewFiscalYearId(fiscalYear.id)}
            >
              {t('closing.fiscalYear.close')}
            </Button>
          )}
          {canReopen && fiscalYear.status === 'CLOSED' && (
            <Button
              size="small"
              danger
              onClick={() => setReopenTarget({ type: 'fiscalYear', record: fiscalYear })}
            >
              {t('closing.fiscalYear.reopen')}
            </Button>
          )}
        </Space>
      ),
    },
  ];

  const periodRunColumns: ColumnsType<ClosingRun> = [
    { title: t('closing.runs.periodName'), dataIndex: 'period_name' },
    {
      title: t('closing.runs.status'),
      dataIndex: 'status',
      render: (value: ClosingRun['status']) => (
        <Tag color={value === 'POSTED' ? 'green' : value === 'REVERSED' ? 'red' : 'default'}>{value}</Tag>
      ),
      width: 130,
    },
    {
      title: t('closing.runs.postedAt'),
      dataIndex: 'posted_at',
      render: (value?: string) => (value ? formatDate(value) : '-'),
      width: 160,
    },
  ];

  const fiscalYearRunColumns: ColumnsType<FiscalYearClosingRun> = [
    { title: t('closing.fiscalRuns.fiscalYearName'), dataIndex: 'fiscal_year_name' },
    {
      title: t('closing.runs.netIncome'),
      dataIndex: 'net_income_amount',
      align: 'right',
      render: (value: number) => formatCurrency(value),
      width: 170,
    },
    {
      title: t('closing.runs.status'),
      dataIndex: 'status',
      render: (value: FiscalYearClosingRun['status']) => (
        <Tag color={value === 'POSTED' ? 'green' : value === 'REVERSED' ? 'red' : 'default'}>{value}</Tag>
      ),
      width: 130,
    },
    {
      title: t('closing.runs.postedAt'),
      dataIndex: 'posted_at',
      render: (value?: string) => (value ? formatDate(value) : '-'),
      width: 160,
    },
  ];

  const periodPreview = periodPreviewQuery.data;
  const fiscalYearPreview = fiscalYearPreviewQuery.data;
  const reopenTitle = reopenTarget?.type === 'fiscalYear'
    ? t('closing.reopen.fiscalYearTitle')
    : t('closing.reopen.periodTitle');

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
                      initialValues={{ period_type: 'MONTHLY' as AccountingPeriodType }}
                    >
                      <div className="grid gap-3 md:grid-cols-2">
                        <Form.Item
                          name="name"
                          label={t('closing.period.name')}
                          rules={[{ required: true }]}
                        >
                          <Input placeholder="Periode Januari 2026" data-testid="gl-closing-period-name" />
                        </Form.Item>
                        <Form.Item name="period_type" label={t('closing.period.type')}>
                          <Select
                            options={[
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

                <Card size="small" title={t('closing.period.listTitle')}>
                  <Table<AccountingPeriod>
                    rowKey="id"
                    size="small"
                    columns={periodColumns}
                    dataSource={periods ?? []}
                    locale={{ emptyText: t('closing.period.empty') }}
                    pagination={false}
                    scroll={{ x: 960 }}
                  />
                </Card>

                <Card size="small" title={t('closing.periodRuns.title')}>
                  <Table<ClosingRun>
                    rowKey="id"
                    size="small"
                    columns={periodRunColumns}
                    dataSource={periodClosingRuns ?? []}
                    locale={{ emptyText: t('closing.runs.empty') }}
                    pagination={false}
                    scroll={{ x: 620 }}
                  />
                </Card>
              </div>
            ),
          },
          {
            key: 'fiscal-years',
            label: t('closing.tabs.fiscalYears'),
            children: (
              <div className="space-y-4">
                <Card size="small" title={t('closing.fiscalYear.listTitle')}>
                  <Table<AccountingFiscalYear>
                    rowKey="id"
                    size="small"
                    columns={fiscalYearColumns}
                    dataSource={fiscalYears ?? []}
                    locale={{ emptyText: t('closing.fiscalYear.empty') }}
                    pagination={false}
                    scroll={{ x: 760 }}
                  />
                </Card>

                <Card size="small" title={t('closing.fiscalRuns.title')}>
                  <Table<FiscalYearClosingRun>
                    rowKey="id"
                    size="small"
                    columns={fiscalYearRunColumns}
                    dataSource={fiscalYearClosingRuns ?? []}
                    locale={{ emptyText: t('closing.fiscalRuns.empty') }}
                    pagination={false}
                    scroll={{ x: 760 }}
                  />
                </Card>
              </div>
            ),
          },
        ]}
      />

      <Modal
        title={t('closing.periodPreview.title')}
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
            disabled={!periodPreview?.can_post || !periodPreview?.trial_balance.is_balanced}
            onClick={handlePostPeriodClosing}
            data-testid="gl-closing-post"
          >
            {t('closing.periodPreview.post')}
          </Button>,
        ]}
      >
        {periodPreviewQuery.isLoading && <Text type="secondary">Loading...</Text>}
        {periodPreviewQuery.isError && (
          <Alert type="error" showIcon message={(periodPreviewQuery.error as Error).message} />
        )}
        {periodPreview && (
          <div className="space-y-3">
            <Descriptions size="small" bordered column={1}>
              <Descriptions.Item label={t('closing.period.name')}>
                {periodPreview.period.name}
              </Descriptions.Item>
              <Descriptions.Item label={t('closing.preview.netIncome')}>
                {formatCurrency(periodPreview.income_statement.net_income)}
              </Descriptions.Item>
              <Descriptions.Item label={t('closing.preview.trialBalance')}>
                {periodPreview.trial_balance.is_balanced
                  ? t('closing.preview.balanced')
                  : t('closing.preview.notBalanced')}
              </Descriptions.Item>
            </Descriptions>

            <Alert
              type="info"
              showIcon
              message={t('closing.periodPreview.noJournal')}
            />

            <PrecheckList prechecks={periodPreview.prechecks} title={t('closing.preview.prechecks')} />

            {!periodPreview.can_post && (
              <Alert type="warning" showIcon message={t('closing.preview.cannotPost')} />
            )}
          </div>
        )}
      </Modal>

      <Modal
        title={t('closing.fiscalPreview.title')}
        open={Boolean(previewFiscalYearId)}
        onCancel={() => setPreviewFiscalYearId(undefined)}
        width={860}
        footer={[
          <Button key="cancel" onClick={() => setPreviewFiscalYearId(undefined)}>
            {t('common.cancel')}
          </Button>,
          <Button
            key="post"
            type="primary"
            danger
            loading={submitting}
            disabled={!fiscalYearPreview?.can_post || !fiscalYearPreview?.preview.is_balanced}
            onClick={handlePostFiscalYearClosing}
          >
            {t('closing.fiscalPreview.post')}
          </Button>,
        ]}
      >
        {fiscalYearPreviewQuery.isLoading && <Text type="secondary">Loading...</Text>}
        {fiscalYearPreviewQuery.isError && (
          <Alert type="error" showIcon message={(fiscalYearPreviewQuery.error as Error).message} />
        )}
        {fiscalYearPreview && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <StatBox label={t('closing.preview.netIncome')} value={formatCurrency(fiscalYearPreview.preview.net_income_amount)} />
              <StatBox label={t('closing.preview.totalRevenue')} value={formatCurrency(fiscalYearPreview.preview.total_revenue_amount)} />
              <StatBox label={t('closing.preview.totalContraRevenue')} value={formatCurrency(fiscalYearPreview.preview.total_contra_revenue_amount)} />
              <StatBox label={t('closing.preview.totalExpense')} value={formatCurrency(fiscalYearPreview.preview.total_expense_amount)} />
            </div>

            <Text type="secondary">
              {t('closing.preview.retainedAccount')}: {fiscalYearPreview.preview.retained_earning_account_code} - {fiscalYearPreview.preview.retained_earning_account_name}
            </Text>

            <Alert
              type={fiscalYearPreview.preview.is_balanced ? 'success' : 'error'}
              showIcon
              message={fiscalYearPreview.preview.is_balanced
                ? t('closing.preview.balanced')
                : t('closing.preview.notBalanced')}
            />

            <PrecheckList prechecks={fiscalYearPreview.prechecks} title={t('closing.preview.prechecks')} />

            <div>
              <Text strong>{t('closing.preview.journalLines')}</Text>
              <Table
                rowKey={(row) => `${row.account_id}-${row.debit}-${row.credit}`}
                size="small"
                className="mt-1"
                pagination={false}
                columns={[
                  { title: t('generalLedger.account'), render: (_, row) => `${row.account_code} - ${row.account_name}` },
                  { title: t('generalLedger.debit'), dataIndex: 'debit', align: 'right', render: (value: number) => (value ? formatCurrency(value) : '-') },
                  { title: t('generalLedger.credit'), dataIndex: 'credit', align: 'right', render: (value: number) => (value ? formatCurrency(value) : '-') },
                ]}
                dataSource={fiscalYearPreview.preview.lines}
              />
            </div>

            {!fiscalYearPreview.can_post && (
              <Alert type="warning" showIcon message={t('closing.preview.cannotPost')} />
            )}
          </div>
        )}
      </Modal>

      <Modal
        title={reopenTitle}
        open={Boolean(reopenTarget)}
        onCancel={closeReopenModal}
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

function PrecheckList({ prechecks, title }: { prechecks: ClosingPrecheck[]; title: string }) {
  return (
    <div>
      <Text strong>{title}</Text>
      <ul className="mt-1 space-y-1">
        {prechecks.map((precheck) => (
          <li key={precheck.key} className="flex items-center gap-2 text-sm">
            {precheck.ok
              ? <CheckCircle2 size={15} className="text-green-600" />
              : <XCircle size={15} className={precheck.blocking ? 'text-red-600' : 'text-amber-500'} />}
            <span>{precheck.message}</span>
          </li>
        ))}
      </ul>
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
