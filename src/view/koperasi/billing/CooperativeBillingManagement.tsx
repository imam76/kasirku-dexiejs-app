import { useState } from 'react';
import { App, Card, Form, Input, Select, Tabs } from 'antd';
import { Bell } from 'lucide-react';
import dayjs from '@/lib/dayjs';
import { useCooperativeCashPreference } from '@/hooks/useCooperativeCashPreference';
import { useCooperativeBilling } from '@/hooks/useCooperativeBilling';
import { useI18n } from '@/hooks/useI18n';
import type { CooperativeLoanInstallment } from '@/types';
import { formatCurrency } from '@/utils/formatters';
import { getInstallmentRemainingAmounts } from '@/utils/koperasi/loanPaymentAllocation';
import CooperativeLoanPaymentFormModal, { type CooperativeLoanPaymentFormValues } from '../installments/CooperativeLoanPaymentFormModal';
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
  const [form] = Form.useForm<CooperativeLoanPaymentFormValues>();
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [payingInstallment, setPayingInstallment] = useState<CooperativeLoanInstallment | null>(null);

  const { getRememberedCashAccountFields, rememberCashAccount } = useCooperativeCashPreference('loanPayment');
  const {
    loanById,
    allUnpaidInstallments,
    overdueInstallments,
    dueTodayInstallments,
    dueThisWeekInstallments,
    memberFilterOptions,
    paymentAccounts,
    selectedInstallment,
    setSelectedInstallment,
    searchText,
    setSearchText,
    memberFilter,
    setMemberFilter,
    overdueCount,
    overdueTotalAmount,
    dueTodayCount,
    dueThisWeekCount,
    recordPayment,
    isMutating,
  } = useCooperativeBilling();

  const closePaymentModal = () => {
    setIsPaymentModalOpen(false);
    setPayingInstallment(null);
    form.resetFields();
  };

  const openPaymentModal = (installment: CooperativeLoanInstallment) => {
    form.resetFields();
    const remaining = getInstallmentRemainingAmounts(installment);
    form.setFieldsValue({
      installment_id: installment.id,
      amount: remaining.total_amount,
      payment_date: dayjs(),
      payment_method: 'TUNAI',
      remember_cash_account: true,
      ...getRememberedCashAccountFields(paymentAccounts),
    });
    setPayingInstallment(installment);
    setIsPaymentModalOpen(true);
  };

  const handleSubmit = async (values: CooperativeLoanPaymentFormValues) => {
    try {
      const result = await recordPayment({
        installment_id: values.installment_id,
        amount: Number(values.amount || 0),
        payment_date: values.payment_date?.toISOString(),
        payment_method: values.payment_method,
        cash_account_id: values.cash_account_id,
        payment_channel: values.payment_channel,
        notes: values.notes,
      });
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

      <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-[minmax(240px,1fr)_minmax(220px,260px)]">
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
                onView={setSelectedInstallment}
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
                onView={setSelectedInstallment}
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
                onView={setSelectedInstallment}
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
                onView={setSelectedInstallment}
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
        onCancel={closePaymentModal}
        onSubmit={handleSubmit}
      />

      <CooperativeBillingDrawer
        installment={selectedInstallment}
        loan={selectedInstallment ? loanById.get(selectedInstallment.loan_id) : undefined}
        open={Boolean(selectedInstallment)}
        onClose={() => setSelectedInstallment(null)}
        onPay={openPaymentModal}
      />
    </Card>
  );
}
