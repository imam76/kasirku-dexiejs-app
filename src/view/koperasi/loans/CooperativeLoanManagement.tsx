import { useState } from 'react';
import { App, Button, Card, Form, Input, Select } from 'antd';
import { Banknote, Plus } from 'lucide-react';
import dayjs from '@/lib/dayjs';
import { useCooperativeCashPreference } from '@/hooks/useCooperativeCashPreference';
import {
  useCooperativeLoans,
  type CooperativeLoanStatusFilter,
} from '@/hooks/useCooperativeLoans';
import { useI18n } from '@/hooks/useI18n';
import type { CooperativeLoan } from '@/types';
import CooperativeLoanDetailDrawer from './CooperativeLoanDetailDrawer';
import CooperativeLoanDisbursementModal, { type CooperativeLoanDisbursementFormValues } from './CooperativeLoanDisbursementModal';
import CooperativeLoanFormModal, { type CooperativeLoanFormValues } from './CooperativeLoanFormModal';
import CooperativeLoanTable from './CooperativeLoanTable';
import { cooperativeLoanStatusOptions } from './loanOptions';

export default function CooperativeLoanManagement() {
  const { message, modal } = App.useApp();
  const { t } = useI18n();
  const [form] = Form.useForm<CooperativeLoanFormValues>();
  const [disbursementForm] = Form.useForm<CooperativeLoanDisbursementFormValues>();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { getRememberedCashAccountFields, rememberCashAccount } = useCooperativeCashPreference('loanDisbursement');
  const {
    activeMembers,
    filteredLoans,
    selectedLoan,
    setSelectedLoan,
    selectedLoanInstallments,
    disbursingLoan,
    setDisbursingLoan,
    paymentAccounts,
    searchText,
    setSearchText,
    statusFilter,
    setStatusFilter,
    createLoan,
    approveLoan,
    rejectLoan,
    disburseLoan,
    isMutating,
  } = useCooperativeLoans();

  const closeModal = () => {
    setIsModalOpen(false);
    form.resetFields();
  };

  const openAddModal = () => {
    form.resetFields();
    form.setFieldsValue({
      application_date: dayjs(),
      interest_rate_per_month: 1,
      tenor_months: 12,
    });
    setIsModalOpen(true);
  };

  const closeDisbursementModal = () => {
    setDisbursingLoan(null);
    disbursementForm.resetFields();
  };

  const openDisbursementModal = (loan: CooperativeLoan) => {
    disbursementForm.resetFields();
    disbursementForm.setFieldsValue({
      disbursement_date: dayjs(),
      first_due_date: dayjs().add(1, 'month'),
      payment_method: 'TUNAI',
      remember_cash_account: true,
      ...getRememberedCashAccountFields(paymentAccounts),
    });
    setDisbursingLoan(loan);
  };

  const handleSubmit = async (values: CooperativeLoanFormValues) => {
    try {
      await createLoan({
        member_id: values.member_id,
        principal_amount: Number(values.principal_amount || 0),
        interest_rate_per_month: Number(values.interest_rate_per_month || 0),
        tenor_months: Number(values.tenor_months || 0),
        application_date: values.application_date?.toISOString(),
        notes: values.notes,
      });
      message.success(t('cooperative.loans.createSuccess'));
      closeModal();
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('cooperative.loans.createFailed'));
    }
  };

  const handleApprove = (loan: CooperativeLoan) => {
    modal.confirm({
      title: t('cooperative.loans.approveConfirmTitle'),
      content: t('cooperative.loans.approveConfirmContent', { loanNumber: loan.loan_number }),
      okText: t('cooperative.loans.approve'),
      cancelText: t('common.cancel'),
      onOk: async () => {
        try {
          await approveLoan({ loan_id: loan.id });
          message.success(t('cooperative.loans.approveSuccess'));
        } catch (error) {
          message.error(error instanceof Error ? error.message : t('cooperative.loans.approveFailed'));
          throw error;
        }
      },
    });
  };

  const handleReject = (loan: CooperativeLoan) => {
    let rejectionReason = '';

    modal.confirm({
      title: t('cooperative.loans.rejectConfirmTitle'),
      content: (
        <div className="space-y-3">
          <p className="text-sm text-gray-500">
            {t('cooperative.loans.rejectConfirmContent', { loanNumber: loan.loan_number })}
          </p>
          <Input.TextArea
            rows={3}
            placeholder={t('cooperative.loans.rejectReasonPlaceholder')}
            onChange={(event) => {
              rejectionReason = event.target.value;
            }}
          />
        </div>
      ),
      okText: t('cooperative.loans.reject'),
      okButtonProps: { danger: true, loading: isMutating },
      cancelText: t('common.cancel'),
      onOk: async () => {
        const reason = rejectionReason.trim();
        if (!reason) {
          throw new Error(t('cooperative.loans.rejectReasonRequired'));
        }

        try {
          await rejectLoan({
            loan_id: loan.id,
            reason,
          });
          message.success(t('cooperative.loans.rejectSuccess'));
        } catch (error) {
          message.error(error instanceof Error ? error.message : t('cooperative.loans.rejectFailed'));
          throw error;
        }
      },
    });
  };

  const handleDisburse = async (values: CooperativeLoanDisbursementFormValues) => {
    if (!disbursingLoan) return;

    try {
      const result = await disburseLoan({
        loan_id: disbursingLoan.id,
        disbursement_date: values.disbursement_date?.toISOString(),
        first_due_date: values.first_due_date?.toISOString(),
        payment_method: values.payment_method,
        cash_account_id: values.cash_account_id,
        payment_channel: values.payment_channel,
        notes: values.notes,
      });
      if (values.remember_cash_account) {
        rememberCashAccount({
          cash_account_id: result.loan.cash_account_id ?? values.cash_account_id,
        });
      }
      message.success(t('cooperative.loans.disburseSuccess'));
      closeDisbursementModal();
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('cooperative.loans.disburseFailed'));
    }
  };

  return (
    <Card
      className="shadow-md"
      title={(
        <div className="flex items-center gap-2">
          <Banknote className="h-5 w-5" />
          {t('cooperative.loans.title')}
        </div>
      )}
      extra={(
        <Button
          type="primary"
          icon={<Plus size={16} />}
          data-testid="koperasi-loan-add-button"
          onClick={openAddModal}
        >
          {t('cooperative.loans.add')}
        </Button>
      )}
    >
      <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-[minmax(240px,1fr)_180px]">
        <Input.Search
          allowClear
          value={searchText}
          placeholder={t('cooperative.loans.searchPlaceholder')}
          onChange={(event) => setSearchText(event.target.value)}
        />
        <Select<CooperativeLoanStatusFilter>
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { value: 'ALL', label: t('cooperative.loans.filter.allStatuses') },
            ...cooperativeLoanStatusOptions.map((option) => ({ value: option.value, label: t(option.labelKey) })),
          ]}
        />
      </div>

      <CooperativeLoanTable
        loans={filteredLoans}
        onView={setSelectedLoan}
        onApprove={handleApprove}
        onReject={handleReject}
        onDisburse={openDisbursementModal}
        loading={isMutating}
      />

      <CooperativeLoanFormModal
        form={form}
        open={isModalOpen}
        isSubmitting={isMutating}
        activeMembers={activeMembers}
        onCancel={closeModal}
        onSubmit={handleSubmit}
      />
      <CooperativeLoanDisbursementModal
        form={disbursementForm}
        loan={disbursingLoan}
        open={Boolean(disbursingLoan)}
        isSubmitting={isMutating}
        paymentAccounts={paymentAccounts}
        onCancel={closeDisbursementModal}
        onSubmit={handleDisburse}
      />
      <CooperativeLoanDetailDrawer
        loan={selectedLoan}
        installments={selectedLoanInstallments}
        open={Boolean(selectedLoan)}
        onClose={() => setSelectedLoan(null)}
      />
    </Card>
  );
}
