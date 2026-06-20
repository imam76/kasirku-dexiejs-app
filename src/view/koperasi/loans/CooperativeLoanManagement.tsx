import { useState } from 'react';
import { App, Button, Card, Form, Input, Select } from 'antd';
import { Banknote, Plus } from 'lucide-react';
import dayjs from '@/lib/dayjs';
import { useCooperativeCashPreference } from '@/hooks/useCooperativeCashPreference';
import { useCooperativeLoanRatePreference } from '@/hooks/useCooperativeLoanRatePreference';
import {
  useCooperativeLoans,
  type CooperativeLoanStatusFilter,
} from '@/hooks/useCooperativeLoans';
import { useI18n } from '@/hooks/useI18n';
import type { CooperativeLoan } from '@/types';
import { getResponsibleFieldCashAccountFields } from '@/utils/koperasi/fieldCashDefaults';
import {
  getFirstScheduledDueDate,
  getNextCollectionDate,
} from '@/utils/koperasi/collectionSchedule';
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
  const { loanRatePreference, rememberLoanRates } = useCooperativeLoanRatePreference();
  const {
    activeMembers,
    members,
    filteredLoans,
    selectedLoan,
    setSelectedLoan,
    selectedLoanInstallments,
    disbursingLoan,
    setDisbursingLoan,
    paymentAccounts,
    fieldCashEmployees,
    employeeCollectionSchedules,
    fieldCashAccountIds,
    fieldCashBalances,
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
      interest_calculation_type: 'MONTHLY_RATE',
      interest_rate_per_month: 1,
      tenor_months: 12,
      loan_service_rate: 0,
      admin_fee_rate: 0,
      mandatory_saving_rate: 0,
      installment_count: 12,
      billing_frequency: 'WEEKLY',
      ...loanRatePreference,
      remember_total_percent_rates: Boolean(loanRatePreference),
    });
    setIsModalOpen(true);
  };

  const closeDisbursementModal = () => {
    setDisbursingLoan(null);
    disbursementForm.resetFields();
  };

  const openDisbursementModal = (loan: CooperativeLoan) => {
    disbursementForm.resetFields();
    const member = members.find((item) => item.id === loan.member_id);
    const schedules = employeeCollectionSchedules.filter((schedule) => (
      schedule.employee_id === member?.officer_id &&
      schedule.area_id === member?.area_id
    ));
    const disbursementDate = getNextCollectionDate(schedules, dayjs().tz(), true);
    if (!member?.officer_id || !member.area_id) {
      message.error(t('cooperative.loans.collectionScheduleMissing'));
      return;
    }
    const firstDueDate = disbursementDate
      ? getFirstScheduledDueDate({
          disbursementDate,
          frequency: loan.billing_frequency ?? 'MONTHLY',
          weekday: schedules.find((schedule) => schedule.weekday === (
            disbursementDate.day() === 0 ? 7 : disbursementDate.day()
          ))?.weekday ?? schedules[0]?.weekday ?? 1,
        })
      : undefined;
    disbursementForm.setFieldsValue({
      disbursement_date: disbursementDate,
      first_due_date: firstDueDate,
      payment_method: 'TUNAI',
      remember_cash_account: true,
      ...getRememberedCashAccountFields(paymentAccounts),
      ...getResponsibleFieldCashAccountFields(member, fieldCashEmployees, paymentAccounts),
    });
    setDisbursingLoan(loan);
  };

  const handleSubmit = async (values: CooperativeLoanFormValues) => {
    try {
      const calculationType = values.interest_calculation_type ?? 'MONTHLY_RATE';
      const commonInput = {
        member_id: values.member_id,
        principal_amount: Number(values.principal_amount || 0),
        interest_calculation_type: calculationType,
        application_date: values.application_date?.toISOString(),
        notes: values.notes,
      };

      await createLoan(calculationType === 'TOTAL_PERCENT'
        ? {
            ...commonInput,
            billing_frequency: values.billing_frequency,
            installment_count: Number(values.installment_count || 0),
            loan_service_rate: Number(values.loan_service_rate || 0),
            admin_fee_rate: Number(values.admin_fee_rate || 0),
            mandatory_saving_rate: Number(values.mandatory_saving_rate || 0),
          }
        : {
            ...commonInput,
            interest_rate_per_month: Number(values.interest_rate_per_month || 0),
            tenor_months: Number(values.tenor_months || 0),
          });
      if (calculationType === 'TOTAL_PERCENT') {
        rememberLoanRates(values.remember_total_percent_rates
          ? {
              loan_service_rate: Number(values.loan_service_rate || 0),
              admin_fee_rate: Number(values.admin_fee_rate || 0),
              mandatory_saving_rate: Number(values.mandatory_saving_rate || 0),
            }
          : undefined);
      }
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
        historical_entry: values.disbursement_date?.isBefore(dayjs().tz(), 'day'),
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
        fieldCashAccountIds={fieldCashAccountIds}
        fieldCashBalances={fieldCashBalances}
        collectionSchedules={employeeCollectionSchedules.filter((schedule) => (
          schedule.employee_id === members.find((member) => member.id === disbursingLoan?.member_id)?.officer_id &&
          schedule.area_id === members.find((member) => member.id === disbursingLoan?.member_id)?.area_id
        ))}
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
