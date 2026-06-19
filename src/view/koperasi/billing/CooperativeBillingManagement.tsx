import { useState } from 'react';
import { App, Card, Form, Input, Select, Tabs } from 'antd';
import { Bell } from 'lucide-react';
import { useAuth } from '@/auth/useAuth';
import dayjs from '@/lib/dayjs';
import { useCooperativeCashPreference } from '@/hooks/useCooperativeCashPreference';
import { useCooperativeBilling } from '@/hooks/useCooperativeBilling';
import { useI18n } from '@/hooks/useI18n';
import type { CooperativeLoanInstallment } from '@/types';
import { formatCurrency } from '@/utils/formatters';
import { getInstallmentRemainingAmounts } from '@/utils/koperasi/loanPaymentAllocation';
import CooperativeLoanPaymentFormModal, { type CooperativeLoanPaymentFormValues } from '../installments/CooperativeLoanPaymentFormModal';
import CooperativeBillingCollectionModal, { type CooperativeBillingCollectionFormValues } from './CooperativeBillingCollectionModal';
import CooperativeBillingDrawer from './CooperativeBillingDrawer';
import CooperativeBillingTable from './CooperativeBillingTable';

function StatCard({ label, count, amount }: { label: string; count: number; amount?: number }) {
  return (
    <div className="rounded-lg border border-gray-100 p-3 shadow-sm">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-xl font-semibold text-gray-800">{count}</p>
      {amount !== undefined && (
        <p className="text-sm text-gray-600">Rp {formatCurrency(amount)}</p>
      )}
    </div>
  );
}

export default function CooperativeBillingManagement() {
  const { message } = App.useApp();
  const { t } = useI18n();
  const { can } = useAuth();
  const [form] = Form.useForm<CooperativeLoanPaymentFormValues>();
  const [collectionForm] = Form.useForm<CooperativeBillingCollectionFormValues>();
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isCollectionModalOpen, setIsCollectionModalOpen] = useState(false);
  const [payingInstallment, setPayingInstallment] = useState<CooperativeLoanInstallment | null>(null);
  const [collectingInstallment, setCollectingInstallment] = useState<CooperativeLoanInstallment | null>(null);
  const [fieldCashPaymentBadge, setFieldCashPaymentBadge] = useState<string | undefined>();

  const { getRememberedCashAccountFields, rememberCashAccount } = useCooperativeCashPreference('loanPayment');
  const {
    loanById,
    allUnpaidInstallments,
    overdueInstallments,
    dueTodayInstallments,
    dueThisWeekInstallments,
    memberFilterOptions,
    activeCollectors,
    paymentAccounts,
    selectedInstallment,
    setSelectedInstallment,
    searchText,
    setSearchText,
    memberFilter,
    setMemberFilter,
    officerFilter,
    setOfficerFilter,
    officerFilterOptions,
    overdueCount,
    overdueTotalAmount,
    dueTodayCount,
    dueThisWeekCount,
    recordPayment,
    recordCollection,
    getFieldCashPaymentStatusForInstallment,
    getDefaultCollectorIdForInstallment,
    isMutating,
  } = useCooperativeBilling();
  const canRecordPayment = can('COOPERATIVE_PAYMENT_CREATE');

  const closePaymentModal = () => {
    setIsPaymentModalOpen(false);
    setPayingInstallment(null);
    setFieldCashPaymentBadge(undefined);
    form.resetFields();
  };

  const openPaymentModal = (installment: CooperativeLoanInstallment) => {
    if (!canRecordPayment) {
      message.error('Anda tidak memiliki akses untuk aksi ini.');
      return;
    }

    form.resetFields();
    const remaining = getInstallmentRemainingAmounts(installment);
    const fieldCashStatus = getFieldCashPaymentStatusForInstallment(installment);
    const rememberedFields = getRememberedCashAccountFields(paymentAccounts);
    form.setFieldsValue({
      idempotency_key: crypto.randomUUID(),
      installment_id: installment.id,
      amount: remaining.total_amount,
      payment_date: dayjs(),
      payment_method: 'TUNAI',
      remember_cash_account: true,
      collector_id: getDefaultCollectorIdForInstallment(installment),
      ...rememberedFields,
      ...(fieldCashStatus ? { cash_account_id: fieldCashStatus.cash_account_id } : {}),
    });
    setFieldCashPaymentBadge(fieldCashStatus?.badge);
    setPayingInstallment(installment);
    setIsPaymentModalOpen(true);
  };

  const closeCollectionModal = () => {
    setIsCollectionModalOpen(false);
    setCollectingInstallment(null);
    collectionForm.resetFields();
  };

  const openCollectionModal = (installment: CooperativeLoanInstallment) => {
    if (!canRecordPayment) {
      message.error('Anda tidak memiliki akses untuk aksi ini.');
      return;
    }

    collectionForm.resetFields();
    collectionForm.setFieldsValue({
      event_id: crypto.randomUUID(),
      collection_status: installment.collection_status && installment.collection_status !== 'NONE'
        ? installment.collection_status
        : 'UNABLE_TO_PAY',
      follow_up_date: installment.follow_up_date ? dayjs(installment.follow_up_date) : undefined,
      collection_notes: installment.collection_notes,
    });
    setCollectingInstallment(installment);
    setIsCollectionModalOpen(true);
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
      message.success(t('cooperative.billing.paySuccess'));
      closePaymentModal();
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('cooperative.billing.payFailed'));
    }
  };

  const handleCollectionSubmit = async (values: CooperativeBillingCollectionFormValues) => {
    if (!collectingInstallment) return;

    try {
      await recordCollection({
        event_id: values.event_id,
        installment_id: collectingInstallment.id,
        collection_status: values.collection_status,
        follow_up_date: values.follow_up_date?.toISOString(),
        collection_notes: values.collection_notes,
      });
      message.success(t('cooperative.billing.collection.success'));
      closeCollectionModal();
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('cooperative.billing.collection.failed'));
    }
  };

  return (
    <Card
      className="shadow-md"
      title={(
        <div className="flex items-center gap-2">
          <Bell className="h-5 w-5" />
          {t('cooperative.billing.title')}
        </div>
      )}
    >
      <div className="mb-4 grid grid-cols-3 gap-3">
        <StatCard label={t('cooperative.billing.summaryOverdue')} count={overdueCount} amount={overdueTotalAmount} />
        <StatCard label={t('cooperative.billing.summaryDueToday')} count={dueTodayCount} />
        <StatCard label={t('cooperative.billing.summaryDueThisWeek')} count={dueThisWeekCount} />
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-[minmax(240px,1fr)_minmax(220px,260px)_minmax(220px,260px)]">
        <Input.Search
          allowClear
          value={searchText}
          placeholder={t('cooperative.billing.searchPlaceholder')}
          onChange={(event) => setSearchText(event.target.value)}
        />
        <Select<string>
          showSearch
          value={memberFilter}
          onChange={setMemberFilter}
          optionFilterProp="label"
          options={[
            { value: 'ALL', label: t('cooperative.billing.memberFilter.all') },
            ...memberFilterOptions,
          ]}
        />
        <Select<string>
          showSearch
          value={officerFilter}
          onChange={setOfficerFilter}
          optionFilterProp="label"
          options={[
            { value: 'ALL', label: 'Semua petugas' },
            ...officerFilterOptions,
          ]}
        />
      </div>

      <Tabs
        items={[
          {
            key: 'overdue',
            label: t('cooperative.billing.tab.overdue'),
            children: (
              <CooperativeBillingTable
                installments={overdueInstallments}
                loanById={loanById}
                onPay={openPaymentModal}
                onCollect={openCollectionModal}
                onView={setSelectedInstallment}
                canPay={canRecordPayment}
                canCollect={canRecordPayment}
                loading={isMutating}
              />
            ),
          },
          {
            key: 'today',
            label: t('cooperative.billing.tab.dueToday'),
            children: (
              <CooperativeBillingTable
                installments={dueTodayInstallments}
                loanById={loanById}
                onPay={openPaymentModal}
                onCollect={openCollectionModal}
                onView={setSelectedInstallment}
                canPay={canRecordPayment}
                canCollect={canRecordPayment}
                loading={isMutating}
              />
            ),
          },
          {
            key: 'week',
            label: t('cooperative.billing.tab.dueThisWeek'),
            children: (
              <CooperativeBillingTable
                installments={dueThisWeekInstallments}
                loanById={loanById}
                onPay={openPaymentModal}
                onCollect={openCollectionModal}
                onView={setSelectedInstallment}
                canPay={canRecordPayment}
                canCollect={canRecordPayment}
                loading={isMutating}
              />
            ),
          },
          {
            key: 'all',
            label: t('cooperative.billing.tab.all'),
            children: (
              <CooperativeBillingTable
                installments={allUnpaidInstallments}
                loanById={loanById}
                onPay={openPaymentModal}
                onCollect={openCollectionModal}
                onView={setSelectedInstallment}
                canPay={canRecordPayment}
                canCollect={canRecordPayment}
                loading={isMutating}
              />
            ),
          },
        ]}
      />

      <CooperativeLoanPaymentFormModal
        form={form}
        open={isPaymentModalOpen}
        isSubmitting={isMutating}
        payableInstallments={payingInstallment ? [payingInstallment] : []}
        paymentAccounts={paymentAccounts}
        activeCollectors={activeCollectors}
        fieldCashBadge={fieldCashPaymentBadge}
        onCancel={closePaymentModal}
        onSubmit={handleSubmit}
      />

      <CooperativeBillingCollectionModal
        form={collectionForm}
        open={isCollectionModalOpen}
        isSubmitting={isMutating}
        onCancel={closeCollectionModal}
        onSubmit={handleCollectionSubmit}
      />

      <CooperativeBillingDrawer
        installment={selectedInstallment}
        loan={selectedInstallment ? loanById.get(selectedInstallment.loan_id) : undefined}
        open={Boolean(selectedInstallment)}
        onClose={() => setSelectedInstallment(null)}
        onPay={openPaymentModal}
        onCollect={openCollectionModal}
        canPay={canRecordPayment}
        canCollect={canRecordPayment}
      />
    </Card>
  );
}
