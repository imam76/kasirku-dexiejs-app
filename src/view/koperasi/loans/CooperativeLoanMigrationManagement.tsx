import { useCallback, useMemo, useState } from 'react';
import { App, Button, Card, Form, Input, Space, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { DatabaseBackup, Plus } from 'lucide-react';
import { useAuth } from '@/auth/useAuth';
import { useCooperativeLoanRatePreference } from '@/hooks/useCooperativeLoanRatePreference';
import { useCooperativeLoans } from '@/hooks/useCooperativeLoans';
import { useI18n } from '@/hooks/useI18n';
import dayjs from '@/lib/dayjs';
import type { CooperativeLoan } from '@/types';
import { formatCurrency } from '@/utils/formatters';
import CooperativeLoanDetailDrawer from './CooperativeLoanDetailDrawer';
import CooperativeLoanMigrationModal, {
  type CooperativeLoanMigrationFormValues,
} from './CooperativeLoanMigrationModal';
import { cooperativeLoanStatusOptions } from './loanOptions';

export default function CooperativeLoanMigrationManagement() {
  const { message, modal } = App.useApp();
  const { t } = useI18n();
  const { can } = useAuth();
  const canMigrate = can('COOPERATIVE_LOAN_DISBURSE');
  const canDeleteMigration = can('COOPERATIVE_LOAN_MANAGE') && can('COOPERATIVE_LOAN_DISBURSE');
  const [form] = Form.useForm<CooperativeLoanMigrationFormValues>();
  const { loanRatePreference, rememberLoanRates } = useCooperativeLoanRatePreference();
  const {
    members,
    activeMembers,
    loans,
    employeeCollectionSchedules,
    selectedLoan,
    setSelectedLoan,
    selectedLoanInstallments,
    migrateLoan,
    deleteMigration,
    isMutating,
  } = useCooperativeLoans();

  const [modalOpen, setModalOpen] = useState(false);
  const selectedMemberId = Form.useWatch('member_id', form);

  const selectedMemberSchedules = useMemo(() => {
    const member = members.find((item) => item.id === selectedMemberId);
    if (!member?.officer_id || !member.area_id) return [];
    return employeeCollectionSchedules.filter((schedule) => (
      schedule.employee_id === member.officer_id &&
      schedule.area_id === member.area_id &&
      schedule.is_active
    ));
  }, [employeeCollectionSchedules, members, selectedMemberId]);

  const migrationLoans = useMemo(
    () => loans.filter((loan) => loan.is_migration),
    [loans],
  );

  const statusLabels = useMemo(
    () => cooperativeLoanStatusOptions.reduce<Record<string, { label: string; color?: string }>>((acc, option) => {
      acc[option.value] = { label: t(option.labelKey), color: option.color };
      return acc;
    }, {}),
    [t],
  );

  const openModal = () => {
    form.resetFields();
    const today = dayjs().tz();
    form.setFieldsValue({
      application_date: today,
      disbursement_date: today,
      migration_input_mode: 'DETAILED',
      interest_calculation_type: 'MONTHLY_RATE',
      interest_rate_per_month: 1,
      tenor_months: 12,
      loan_service_rate: 0,
      admin_fee_rate: 0,
      mandatory_saving_rate: 0,
      installment_count: 12,
      billing_frequency: 'WEEKLY',
      settled_mode: 'INSTALLMENT',
      ...loanRatePreference,
      remember_total_percent_rates: Boolean(loanRatePreference),
    });
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    form.resetFields();
  };

  const handleMigrate = async (values: CooperativeLoanMigrationFormValues) => {
    const member = members.find((item) => item.id === values.member_id);
    if (!member?.officer_id || !member.area_id) {
      message.error(t('cooperative.loans.collectionScheduleMissing'));
      return;
    }
    const schedules = employeeCollectionSchedules.filter((schedule) => (
      schedule.employee_id === member.officer_id &&
      schedule.area_id === member.area_id &&
      schedule.is_active
    ));
    if (schedules.length === 0) {
      message.error(t('cooperative.loans.collectionScheduleMissing'));
      return;
    }

    const inputMode = values.migration_input_mode ?? 'DETAILED';
    const isTotalPayableMode = inputMode === 'TOTAL_PAYABLE';
    const calculationType = isTotalPayableMode ? 'TOTAL_PERCENT' : values.interest_calculation_type;
    const applicationDate = values.application_date;
    const disbursementDate = values.disbursement_date;
    const scheduledDisbursementDate = values.scheduled_disbursement_date;
    if (disbursementDate.isBefore(applicationDate, 'day')) {
      message.error(t('cooperative.loans.validation.disbursementBeforeApplication'));
      return;
    }
    const firstDueDate = values.first_due_date;

    try {
      const commonInput = {
        member_id: values.member_id,
        principal_amount: isTotalPayableMode
          ? Number(values.total_payable_amount || 0)
          : Number(values.principal_amount || 0),
        interest_calculation_type: calculationType,
        application_date: applicationDate.toISOString(),
        notes: values.notes,
      };
      const schemeInput = isTotalPayableMode
        ? {
            billing_frequency: values.billing_frequency,
            installment_count: Number(values.installment_count || 12),
            loan_service_rate: 0,
            admin_fee_rate: 0,
            mandatory_saving_rate: 0,
          }
        : calculationType === 'TOTAL_PERCENT'
        ? {
            billing_frequency: values.billing_frequency,
            installment_count: Number(values.installment_count || 0),
            loan_service_rate: Number(values.loan_service_rate || 0),
            admin_fee_rate: Number(values.admin_fee_rate || 0),
            mandatory_saving_rate: Number(values.mandatory_saving_rate || 0),
          }
        : {
            interest_rate_per_month: Number(values.interest_rate_per_month || 0),
            tenor_months: Number(values.tenor_months || 0),
          };

      // Satu mutation atomic: create + approve + disburse-migrasi dalam satu transaksi Dexie,
      // sehingga kegagalan di tengah tidak meninggalkan pinjaman parsial.
      await migrateLoan({
        ...commonInput,
        ...schemeInput,
        disbursement_date: disbursementDate.toISOString(),
        scheduled_disbursement_date: scheduledDisbursementDate.toISOString(),
        first_due_date: firstDueDate.toISOString(),
        settled_through_installment_number: !isTotalPayableMode && values.settled_mode === 'INSTALLMENT'
          ? Number(values.settled_through_installment_number ?? 0)
          : undefined,
        migration_outstanding_principal_amount: !isTotalPayableMode && values.settled_mode === 'PRINCIPAL'
          ? Number(values.outstanding_principal_amount ?? 0)
          : undefined,
        migration_outstanding_interest_amount: !isTotalPayableMode && values.settled_mode === 'PRINCIPAL' && values.outstanding_interest_amount != null
          ? Number(values.outstanding_interest_amount)
          : undefined,
        migration_outstanding_total_amount: isTotalPayableMode || values.settled_mode === 'TOTAL'
          ? Number(values.remaining_total_amount ?? 0)
          : undefined,
      });
      if (!isTotalPayableMode && calculationType === 'TOTAL_PERCENT') {
        rememberLoanRates(values.remember_total_percent_rates
          ? {
              loan_service_rate: Number(values.loan_service_rate || 0),
              admin_fee_rate: Number(values.admin_fee_rate || 0),
              mandatory_saving_rate: Number(values.mandatory_saving_rate || 0),
            }
          : undefined);
      }

      message.success(t('cooperative.loans.migration.success'));
      closeModal();
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('cooperative.loans.migration.failed'));
    }
  };

  const handleDeleteMigration = useCallback((loan: CooperativeLoan) => {
    let deletionReason = '';

    modal.confirm({
      title: t('cooperative.loans.migration.deleteConfirmTitle'),
      content: (
        <div className="space-y-3">
          <p className="text-sm text-gray-500">
            {t('cooperative.loans.migration.deleteConfirmContent', { loanNumber: loan.loan_number })}
          </p>
          <Input.TextArea
            rows={3}
            placeholder={t('cooperative.loans.migration.deleteReasonPlaceholder')}
            onChange={(event) => {
              deletionReason = event.target.value;
            }}
          />
        </div>
      ),
      okText: t('cooperative.loans.migration.delete'),
      okButtonProps: { danger: true, loading: isMutating },
      cancelText: t('common.cancel'),
      onOk: async () => {
        const reason = deletionReason.trim();
        if (reason.length < 3) {
          throw new Error(t('cooperative.loans.migration.deleteReasonRequired'));
        }
        try {
          await deleteMigration({ loan_id: loan.id, reason });
          if (selectedLoan?.id === loan.id) setSelectedLoan(null);
          message.success(t('cooperative.loans.migration.deleteSuccess'));
        } catch (error) {
          message.error(error instanceof Error ? error.message : t('cooperative.loans.migration.deleteFailed'));
          throw error;
        }
      },
    });
  }, [deleteMigration, isMutating, message, modal, selectedLoan, setSelectedLoan, t]);

  const columns = useMemo<ColumnsType<CooperativeLoan>>(() => [
    {
      title: t('cooperative.loans.table.loanNumber'),
      dataIndex: 'loan_number',
      key: 'loan_number',
    },
    {
      title: t('cooperative.loans.table.member'),
      key: 'member',
      render: (_value, loan) => `${loan.member_number} - ${loan.member_name}`,
    },
    {
      title: t('cooperative.loans.form.principalAmount'),
      dataIndex: 'principal_amount',
      key: 'principal_amount',
      align: 'right',
      render: (value: number) => `Rp ${formatCurrency(value)}`,
    },
    {
      title: t('cooperative.loans.migration.outstandingPrincipal'),
      dataIndex: 'outstanding_principal_amount',
      key: 'outstanding_principal_amount',
      align: 'right',
      render: (value: number) => `Rp ${formatCurrency(value)}`,
    },
    {
      title: t('cooperative.loans.table.status'),
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => {
        const label = statusLabels[status];
        return <Tag color={label?.color}>{label?.label ?? status}</Tag>;
      },
    },
    {
      title: t('cooperative.loans.table.action'),
      key: 'action',
      render: (_value, loan) => (
        <Space size={0}>
          <Button type="link" onClick={() => setSelectedLoan(loan)}>
            {t('cooperative.loans.view')}
          </Button>
          {canDeleteMigration && (
            <Button
              type="link"
              danger
              data-testid={`koperasi-loan-migration-delete-${loan.member_number}`}
              onClick={() => handleDeleteMigration(loan)}
            >
              {t('cooperative.loans.migration.delete')}
            </Button>
          )}
        </Space>
      ),
    },
  ], [canDeleteMigration, handleDeleteMigration, setSelectedLoan, statusLabels, t]);

  return (
    <Card
      className="shadow-md"
      title={(
        <div className="flex items-center gap-2">
          <DatabaseBackup className="h-5 w-5" />
          {t('cooperative.loans.migration.title')}
        </div>
      )}
      extra={canMigrate && (
        <Button
          type="primary"
          icon={<Plus size={16} />}
          data-testid="koperasi-loan-migration-add-button"
          onClick={openModal}
        >
          {t('cooperative.loans.migration.add')}
        </Button>
      )}
    >
      <Table<CooperativeLoan>
        rowKey="id"
        columns={columns}
        dataSource={migrationLoans}
        loading={isMutating}
        pagination={{ pageSize: 10 }}
        onRow={(loan) => ({ 'data-testid': `koperasi-loan-migration-row-${loan.member_number}` } as React.HTMLAttributes<HTMLElement>)}
      />

      <CooperativeLoanMigrationModal
        form={form}
        open={modalOpen}
        isSubmitting={isMutating}
        activeMembers={activeMembers}
        collectionSchedules={selectedMemberSchedules}
        onCancel={closeModal}
        onSubmit={handleMigrate}
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
