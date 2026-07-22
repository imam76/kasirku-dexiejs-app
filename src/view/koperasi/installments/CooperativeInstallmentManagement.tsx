import { useState } from 'react';
import { App, Button, Card, Form, Input, Select, Space, Table, Tabs, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { CreditCard, Plus } from 'lucide-react';
import { useAuth } from '@/auth/useAuth';
import dayjs from '@/lib/dayjs';
import { useCooperativeCashPreference } from '@/hooks/useCooperativeCashPreference';
import {
  useCooperativeInstallments,
  type CooperativeInstallmentLoanStatusFilter,
  type CooperativeInstallmentLoanSummary,
  type CooperativeInstallmentMemberFilter,
  type CooperativeLoanPaymentStatusFilter,
} from '@/hooks/useCooperativeInstallments';
import { useI18n } from '@/hooks/useI18n';
import type {
  CooperativeLoanInstallment,
  CooperativeLoanPayment,
  CooperativePaymentApprovalRequest,
} from '@/types';
import { formatCurrency } from '@/utils/formatters';
import { getInstallmentRemainingAmounts } from '@/utils/koperasi/loanPaymentAllocation';
import CooperativeInstallmentLoanDrawer from './CooperativeInstallmentLoanDrawer';
import CooperativeInstallmentTable from './CooperativeInstallmentTable';
import CooperativeLoanPaymentDetailDrawer from './CooperativeLoanPaymentDetailDrawer';
import CooperativeLoanPaymentFormModal, { type CooperativeLoanPaymentFormValues } from './CooperativeLoanPaymentFormModal';
import CooperativeLoanPaymentTable from './CooperativeLoanPaymentTable';

function StatCard({ label, count, amount }: { label: string; count?: number; amount?: number }) {
  return (
    <div className="rounded-lg border border-gray-100 p-3 shadow-sm">
      <p className="text-xs text-gray-500">{label}</p>
      {count !== undefined && <p className="text-xl font-semibold text-gray-800">{count}</p>}
      {amount !== undefined && <p className="text-lg font-semibold text-gray-800">Rp {formatCurrency(amount)}</p>}
    </div>
  );
}

export default function CooperativeInstallmentManagement() {
  const { message, modal } = App.useApp();
  const { t } = useI18n();
  const { can } = useAuth();
  const [form] = Form.useForm<CooperativeLoanPaymentFormValues>();
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [fieldCashPaymentBadge, setFieldCashPaymentBadge] = useState<string | undefined>();
  const [activeTab, setActiveTab] = useState('balances');
  const [selectedLoanId, setSelectedLoanId] = useState<string | null>(null);
  const { getRememberedCashAccountFields, rememberCashAccount } = useCooperativeCashPreference('loanPayment');
  const {
    loanSummaries,
    filteredLoanSummaries,
    payableInstallments,
    payments,
    filteredPayments,
    memberFilterOptions,
    activeCollectors,
    paymentAccounts,
    payingInstallment,
    setPayingInstallment,
    selectedPayment,
    setSelectedPayment,
    searchText,
    setSearchText,
    memberFilter,
    setMemberFilter,
    loanStatusFilter,
    setLoanStatusFilter,
    paymentStatusFilter,
    setPaymentStatusFilter,
    approvalRequests,
    canApprovePayment,
    recordPayment,
    reversePayment,
    approvePaymentRequest,
    rejectPaymentRequest,
    getFieldCashPaymentStatusForInstallment,
    getDefaultCollectorIdForInstallment,
    isMutating,
  } = useCooperativeInstallments();
  const canRecordPayment = can('COOPERATIVE_PAYMENT_CREATE');
  const selectedLoanSummary = selectedLoanId
    ? loanSummaries.find((summary) => summary.loan.id === selectedLoanId) ?? null
    : null;
  const activeLoanSummaries = loanSummaries.filter((summary) => (
    summary.loan.status === 'DISBURSED' && summary.remainingAmount > 0.01
  ));
  const activeTotalPaid = activeLoanSummaries.reduce((sum, summary) => sum + summary.totalPaidAmount, 0);
  const activeTotalRemaining = activeLoanSummaries.reduce((sum, summary) => sum + summary.remainingAmount, 0);
  const approvalColumns: ColumnsType<CooperativePaymentApprovalRequest> = [
    {
      title: t('cooperative.installments.approval.requestedAt'),
      dataIndex: 'requested_at',
      key: 'requested_at',
      render: (value: string) => dayjs(value).format('DD/MM/YYYY HH:mm'),
    },
    {
      title: t('cooperative.installments.approval.action'),
      dataIndex: 'action_type',
      key: 'action_type',
      render: (value: CooperativePaymentApprovalRequest['action_type']) => (
        <Tag color={value === 'REVERSAL' ? 'orange' : 'blue'}>
          {t(value === 'REVERSAL'
            ? 'cooperative.installments.approval.reversal'
            : 'cooperative.installments.approval.backdate')}
        </Tag>
      ),
    },
    {
      title: t('cooperative.installments.approval.reference'),
      key: 'reference',
      render: (_value, request) => request.payment_id ?? request.installment_id ?? '-',
    },
    {
      title: t('cooperative.installments.approval.maker'),
      dataIndex: 'maker_user_name',
      key: 'maker_user_name',
    },
    {
      title: t('cooperative.installments.approval.reason'),
      dataIndex: 'maker_reason',
      key: 'maker_reason',
      render: (value: string) => <Typography.Text>{value}</Typography.Text>,
    },
    {
      title: t('cooperative.installments.approval.status'),
      dataIndex: 'status',
      key: 'status',
      render: (value: CooperativePaymentApprovalRequest['status']) => (
        <Tag color={value === 'APPROVED' ? 'green' : value === 'REJECTED' ? 'red' : 'gold'}>
          {t(value === 'APPROVED'
            ? 'cooperative.installments.approval.status.approved'
            : value === 'REJECTED'
              ? 'cooperative.installments.approval.status.rejected'
              : 'cooperative.installments.approval.status.pending')}
        </Tag>
      ),
    },
    {
      title: t('cooperative.installments.table.action'),
      key: 'action',
      render: (_value, request) => request.status === 'PENDING' || (
        request.status === 'APPROVED' && !request.result_payment_id
      ) ? (
        <Space>
          <Button
            type="primary"
            size="small"
            onClick={() => {
              modal.confirm({
                title: t('cooperative.installments.approval.approveTitle'),
                content: t('cooperative.installments.approval.approveContent'),
                okText: t('cooperative.installments.approval.approve'),
                cancelText: t('common.cancel'),
                onOk: async () => {
                  await approvePaymentRequest(request.id);
                  message.success(t('cooperative.installments.approval.approveSuccess'));
                },
              });
            }}
          >
            {t('cooperative.installments.approval.approve')}
          </Button>
          {(request.status === 'PENDING' || !request.result_payment_id) && (
            <Button
              danger
              size="small"
              onClick={() => {
                let rejectionReason = '';
                modal.confirm({
                  title: t('cooperative.installments.approval.rejectTitle'),
                  content: (
                    <Input.TextArea
                      rows={3}
                      placeholder={t('cooperative.installments.approval.rejectReason')}
                      onChange={(event) => {
                        rejectionReason = event.target.value;
                      }}
                    />
                  ),
                  okText: t('cooperative.installments.approval.reject'),
                  okButtonProps: { danger: true },
                  cancelText: t('common.cancel'),
                  onOk: async () => {
                    const reason = rejectionReason.trim();
                    if (reason.length < 3) {
                      throw new Error(t('cooperative.installments.approval.rejectReasonRequired'));
                    }
                    await rejectPaymentRequest(request.id, reason);
                    message.success(t('cooperative.installments.approval.rejectSuccess'));
                  },
                });
              }}
            >
              {t('cooperative.installments.approval.reject')}
            </Button>
          )}
        </Space>
      ) : '-',
    },
  ];

  const getPaymentDefaultFields = (installment?: CooperativeLoanInstallment) => {
    const fieldCashStatus = installment ? getFieldCashPaymentStatusForInstallment(installment) : undefined;

    return {
      fields: {
        ...getRememberedCashAccountFields(paymentAccounts),
        collector_id: installment ? getDefaultCollectorIdForInstallment(installment) : undefined,
        ...(fieldCashStatus ? { cash_account_id: fieldCashStatus.cash_account_id } : {}),
      },
      fieldCashBadge: fieldCashStatus?.badge,
    };
  };

  const closePaymentModal = () => {
    setIsPaymentModalOpen(false);
    setPayingInstallment(null);
    setFieldCashPaymentBadge(undefined);
    form.resetFields();
  };

  const openPaymentModal = (installment?: CooperativeLoanInstallment) => {
    if (!canRecordPayment) {
      message.error(t('cooperative.installments.noPermission'));
      return;
    }

    form.resetFields();
    const remaining = installment ? getInstallmentRemainingAmounts(installment) : undefined;
    const paymentDefaults = getPaymentDefaultFields(installment);
    form.setFieldsValue({
      idempotency_key: crypto.randomUUID(),
      installment_id: installment?.id,
      amount: remaining?.total_amount,
      payment_date: dayjs(),
      payment_method: 'TUNAI',
      remember_cash_account: true,
      ...paymentDefaults.fields,
    });
    setFieldCashPaymentBadge(paymentDefaults.fieldCashBadge);
    setPayingInstallment(installment ?? null);
    setIsPaymentModalOpen(true);
  };

  const openLoanPaymentModal = (summary: CooperativeInstallmentLoanSummary) => {
    if (!summary.nextInstallment) return;
    openPaymentModal(summary.nextInstallment);
  };

  const handleInstallmentChange = (installment?: CooperativeLoanInstallment) => {
    const remaining = installment ? getInstallmentRemainingAmounts(installment) : undefined;
    const paymentDefaults = getPaymentDefaultFields(installment);

    form.setFieldsValue({
      amount: remaining?.total_amount,
      ...paymentDefaults.fields,
    });
    setFieldCashPaymentBadge(paymentDefaults.fieldCashBadge);
  };

  const handleSubmit = async (values: CooperativeLoanPaymentFormValues) => {
    try {
      const result = await recordPayment({
        idempotency_key: values.idempotency_key,
        installment_id: values.installment_id,
        amount: Number(values.amount || 0),
        payment_date: values.payment_date?.tz().format(),
        payment_method: values.payment_method,
        cash_account_id: values.cash_account_id,
        payment_channel: values.payment_channel,
        collector_id: values.collector_id,
        notes: values.notes,
      });
      if (result.status === 'PENDING_APPROVAL') {
        message.success(t('cooperative.installments.backdateApprovalRequested'));
        closePaymentModal();
        return;
      }
      if (values.remember_cash_account) {
        rememberCashAccount({
          cash_account_id: result.payment.cash_account_id ?? values.cash_account_id,
        });
      }
      message.success(t('cooperative.installments.paymentSuccess'));
      closePaymentModal();
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('cooperative.installments.paymentFailed'));
    }
  };

  const handleQuickPayment = async (summary: CooperativeInstallmentLoanSummary, amount: number) => {
    if (!canRecordPayment) {
      message.error(t('cooperative.installments.noPermission'));
      return false;
    }
    if (!summary.nextInstallment) return false;

    try {
      const paymentDefaults = getPaymentDefaultFields(summary.nextInstallment);
      const result = await recordPayment({
        idempotency_key: crypto.randomUUID(),
        installment_id: summary.nextInstallment.id,
        amount: Number(amount || 0),
        payment_date: dayjs().tz().format(),
        payment_method: 'TUNAI',
        cash_account_id: paymentDefaults.fields.cash_account_id,
        collector_id: paymentDefaults.fields.collector_id,
      });
      if (result.status === 'PENDING_APPROVAL') {
        message.success(t('cooperative.installments.backdateApprovalRequested'));
        return true;
      }

      rememberCashAccount({
        cash_account_id: result.payment.cash_account_id ?? paymentDefaults.fields.cash_account_id,
      });
      message.success(t('cooperative.installments.paymentSuccess'));
      return true;
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('cooperative.installments.paymentFailed'));
      return false;
    }
  };

  const handleReverse = (payment: CooperativeLoanPayment) => {
    let reversalReason = '';

    modal.confirm({
      title: t('cooperative.installments.reverseConfirmTitle'),
      content: (
        <div className="space-y-3">
          <p className="text-sm text-gray-500">
            {t('cooperative.installments.reverseConfirmContent', {
              paymentNumber: payment.payment_number,
              amount: payment.amount,
            })}
          </p>
          <Input.TextArea
            rows={3}
            placeholder={t('cooperative.installments.reverseReasonPlaceholder')}
            onChange={(event) => {
              reversalReason = event.target.value;
            }}
          />
        </div>
      ),
      okText: t('cooperative.installments.reverse'),
      okButtonProps: { danger: true, loading: isMutating },
      cancelText: t('common.cancel'),
      onOk: async () => {
        const reason = reversalReason.trim();
        if (!reason) {
          throw new Error(t('cooperative.installments.reverseReasonRequired'));
        }

        try {
          await reversePayment({
            payment_id: payment.id,
            reason,
          });
          message.success(t('cooperative.installments.reverseApprovalRequested'));
        } catch (error) {
          message.error(error instanceof Error ? error.message : t('cooperative.installments.reverseFailed'));
          throw error;
        }
      },
    });
  };

  return (
    <Card
      className="shadow-md"
      title={(
        <div className="flex items-center gap-2">
          <CreditCard className="h-5 w-5" />
          {t('cooperative.installments.title')}
        </div>
      )}
      extra={(
        <Button
          type="primary"
          icon={<Plus size={16} />}
          disabled={!canRecordPayment}
          onClick={() => openPaymentModal()}
        >
          {t('cooperative.installments.addPayment')}
        </Button>
      )}
    >
      <Typography.Paragraph type="secondary" className="mb-4">
        {t('cooperative.installments.subtitle')}
      </Typography.Paragraph>

      <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
        <StatCard label={t('cooperative.installments.summary.activeLoans')} count={activeLoanSummaries.length} />
        <StatCard label={t('cooperative.installments.summary.totalPaid')} amount={activeTotalPaid} />
        <StatCard label={t('cooperative.installments.summary.totalRemaining')} amount={activeTotalRemaining} />
      </div>

      {activeTab !== 'approvals' && (
        <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-[minmax(240px,1fr)_minmax(220px,260px)_minmax(180px,220px)]">
          <Input.Search
            allowClear
            value={searchText}
            placeholder={t('cooperative.installments.searchPlaceholder')}
            onChange={(event) => setSearchText(event.target.value)}
          />
          <Select<CooperativeInstallmentMemberFilter>
            showSearch
            value={memberFilter}
            onChange={setMemberFilter}
            optionFilterProp="label"
            options={[
              { value: 'ALL', label: t('cooperative.installments.filter.allMembers') },
              ...memberFilterOptions,
            ]}
          />
          {activeTab === 'balances' ? (
            <Select<CooperativeInstallmentLoanStatusFilter>
              value={loanStatusFilter}
              onChange={setLoanStatusFilter}
              options={[
                { value: 'ACTIVE', label: t('cooperative.installments.filter.activeLoans') },
                { value: 'PAID_OFF', label: t('cooperative.installments.filter.paidOffLoans') },
                { value: 'ALL', label: t('cooperative.installments.filter.allLoans') },
              ]}
            />
          ) : (
            <Select<CooperativeLoanPaymentStatusFilter>
              value={paymentStatusFilter}
              onChange={setPaymentStatusFilter}
              options={[
                { value: 'POSTED', label: t('cooperative.installments.paymentStatus.posted') },
                { value: 'REVERSED', label: t('cooperative.installments.paymentStatus.reversed') },
                { value: 'ALL', label: t('cooperative.installments.filter.allPayments') },
              ]}
            />
          )}
        </div>
      )}

      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          {
            key: 'balances',
            label: t('cooperative.installments.tab.balances'),
            children: (
              <CooperativeInstallmentTable
                summaries={filteredLoanSummaries}
                onPay={openLoanPaymentModal}
                onQuickPay={handleQuickPayment}
                onView={(summary) => setSelectedLoanId(summary.loan.id)}
                canPay={canRecordPayment}
                loading={isMutating}
              />
            ),
          },
          {
            key: 'payments',
            label: t('cooperative.installments.tab.payments'),
            children: (
              <CooperativeLoanPaymentTable
                payments={filteredPayments}
                onView={setSelectedPayment}
                onReverse={handleReverse}
                loading={isMutating}
              />
            ),
          },
          ...(canApprovePayment ? [{
            key: 'approvals',
            label: `${t('cooperative.installments.approval.tab')} (${approvalRequests.filter((request) => request.status === 'PENDING').length})`,
            children: (
              <Table
                rowKey="id"
                dataSource={approvalRequests}
                columns={approvalColumns}
                loading={isMutating}
                pagination={{ pageSize: 8 }}
                scroll={{ x: 1200 }}
                locale={{ emptyText: t('cooperative.installments.approval.empty') }}
              />
            ),
          }] : []),
        ]}
      />

      <CooperativeLoanPaymentFormModal
        form={form}
        open={isPaymentModalOpen}
        isSubmitting={isMutating}
        payableInstallments={payingInstallment
          ? [
              payingInstallment,
              ...payableInstallments.filter((item) => (
                item.loan_id === payingInstallment.loan_id && item.id !== payingInstallment.id
              )),
            ]
          : payableInstallments}
        paymentAccounts={paymentAccounts}
        activeCollectors={activeCollectors}
        fieldCashBadge={fieldCashPaymentBadge}
        onInstallmentChange={handleInstallmentChange}
        onCancel={closePaymentModal}
        onSubmit={handleSubmit}
      />
      <CooperativeInstallmentLoanDrawer
        summary={selectedLoanSummary}
        payments={payments}
        open={Boolean(selectedLoanSummary)}
        canPay={canRecordPayment}
        loading={isMutating}
        onClose={() => setSelectedLoanId(null)}
        onPay={openLoanPaymentModal}
      />
      <CooperativeLoanPaymentDetailDrawer
        payment={selectedPayment}
        open={Boolean(selectedPayment)}
        onClose={() => setSelectedPayment(null)}
      />
    </Card>
  );
}
