import { useState } from 'react';
import { App, Button, Card, Form, Input, Select, Tabs } from 'antd';
import { CreditCard, Plus } from 'lucide-react';
import dayjs from '@/lib/dayjs';
import {
  useCooperativeInstallments,
  type CooperativeInstallmentStatusFilter,
  type CooperativeLoanPaymentStatusFilter,
} from '@/hooks/useCooperativeInstallments';
import { useI18n } from '@/hooks/useI18n';
import type { CooperativeLoanInstallment, CooperativeLoanPayment } from '@/types';
import { getInstallmentRemainingAmounts } from '@/utils/koperasi/loanPaymentAllocation';
import CooperativeInstallmentTable from './CooperativeInstallmentTable';
import CooperativeLoanPaymentDetailDrawer from './CooperativeLoanPaymentDetailDrawer';
import CooperativeLoanPaymentFormModal, { type CooperativeLoanPaymentFormValues } from './CooperativeLoanPaymentFormModal';
import CooperativeLoanPaymentTable from './CooperativeLoanPaymentTable';
import { cooperativeLoanInstallmentStatusOptions } from '../loans/loanOptions';

export default function CooperativeInstallmentManagement() {
  const { message, modal } = App.useApp();
  const { t } = useI18n();
  const [form] = Form.useForm<CooperativeLoanPaymentFormValues>();
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const {
    filteredInstallments,
    payableInstallments,
    filteredPayments,
    paymentAccounts,
    loanById,
    payingInstallment,
    setPayingInstallment,
    selectedPayment,
    setSelectedPayment,
    searchText,
    setSearchText,
    installmentStatusFilter,
    setInstallmentStatusFilter,
    paymentStatusFilter,
    setPaymentStatusFilter,
    recordPayment,
    reversePayment,
    isMutating,
  } = useCooperativeInstallments();

  const closePaymentModal = () => {
    setIsPaymentModalOpen(false);
    setPayingInstallment(null);
    form.resetFields();
  };

  const openPaymentModal = (installment?: CooperativeLoanInstallment) => {
    form.resetFields();
    const remaining = installment ? getInstallmentRemainingAmounts(installment) : undefined;
    form.setFieldsValue({
      installment_id: installment?.id,
      amount: remaining?.total_amount,
      payment_date: dayjs(),
      payment_method: 'TUNAI',
    });
    setPayingInstallment(installment ?? null);
    setIsPaymentModalOpen(true);
  };

  const handleSubmit = async (values: CooperativeLoanPaymentFormValues) => {
    try {
      await recordPayment({
        installment_id: values.installment_id,
        amount: Number(values.amount || 0),
        payment_date: values.payment_date?.toISOString(),
        payment_method: values.payment_method,
        cash_account_id: values.cash_account_id,
        payment_channel: values.payment_channel,
        notes: values.notes,
      });
      message.success(t('cooperative.installments.paymentSuccess'));
      closePaymentModal();
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('cooperative.installments.paymentFailed'));
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
          message.success(t('cooperative.installments.reverseSuccess'));
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
        <Button type="primary" icon={<Plus size={16} />} onClick={() => openPaymentModal()}>
          {t('cooperative.installments.addPayment')}
        </Button>
      )}
    >
      <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-[minmax(240px,1fr)_170px_170px]">
        <Input.Search
          allowClear
          value={searchText}
          placeholder={t('cooperative.installments.searchPlaceholder')}
          onChange={(event) => setSearchText(event.target.value)}
        />
        <Select<CooperativeInstallmentStatusFilter>
          value={installmentStatusFilter}
          onChange={setInstallmentStatusFilter}
          options={[
            { value: 'DUE', label: t('cooperative.installments.filter.due') },
            { value: 'ALL', label: t('cooperative.installments.filter.allInstallments') },
            ...cooperativeLoanInstallmentStatusOptions.map((option) => ({ value: option.value, label: t(option.labelKey) })),
          ]}
        />
        <Select<CooperativeLoanPaymentStatusFilter>
          value={paymentStatusFilter}
          onChange={setPaymentStatusFilter}
          options={[
            { value: 'POSTED', label: t('cooperative.installments.paymentStatus.posted') },
            { value: 'REVERSED', label: t('cooperative.installments.paymentStatus.reversed') },
            { value: 'ALL', label: t('cooperative.installments.filter.allPayments') },
          ]}
        />
      </div>

      <Tabs
        items={[
          {
            key: 'installments',
            label: t('cooperative.installments.tab.installments'),
            children: (
              <CooperativeInstallmentTable
                installments={filteredInstallments}
                loanById={loanById}
                onPay={openPaymentModal}
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
        ]}
      />

      <CooperativeLoanPaymentFormModal
        form={form}
        open={isPaymentModalOpen}
        isSubmitting={isMutating}
        payableInstallments={payingInstallment ? [payingInstallment, ...payableInstallments.filter((item) => item.id !== payingInstallment.id)] : payableInstallments}
        paymentAccounts={paymentAccounts}
        onCancel={closePaymentModal}
        onSubmit={handleSubmit}
      />
      <CooperativeLoanPaymentDetailDrawer
        payment={selectedPayment}
        open={Boolean(selectedPayment)}
        onClose={() => setSelectedPayment(null)}
      />
    </Card>
  );
}
