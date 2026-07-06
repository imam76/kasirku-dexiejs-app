import { useMemo, useState } from 'react';
import { App, Button, Card, Form, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { DatabaseBackup, Plus } from 'lucide-react';
import { useAuth } from '@/auth/useAuth';
import { useCooperativeLoans } from '@/hooks/useCooperativeLoans';
import { useI18n } from '@/hooks/useI18n';
import type { CooperativeLoan } from '@/types';
import { formatCurrency } from '@/utils/formatters';
import { getFirstScheduledDueDate } from '@/utils/koperasi/collectionSchedule';
import CooperativeLoanDetailDrawer from './CooperativeLoanDetailDrawer';
import CooperativeLoanMigrationModal, {
  type CooperativeLoanMigrationFormValues,
} from './CooperativeLoanMigrationModal';
import { cooperativeLoanStatusOptions } from './loanOptions';

export default function CooperativeLoanMigrationManagement() {
  const { message } = App.useApp();
  const { t } = useI18n();
  const { can } = useAuth();
  const canMigrate = can('COOPERATIVE_LOAN_DISBURSE');
  const [form] = Form.useForm<CooperativeLoanMigrationFormValues>();
  const {
    members,
    activeMembers,
    loans,
    employeeCollectionSchedules,
    selectedLoan,
    setSelectedLoan,
    selectedLoanInstallments,
    migrateLoan,
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
    form.setFieldsValue({
      interest_calculation_type: 'MONTHLY_RATE',
      interest_rate_per_month: 1,
      tenor_months: 12,
      loan_service_rate: 0,
      admin_fee_rate: 0,
      mandatory_saving_rate: 0,
      installment_count: 12,
      billing_frequency: 'WEEKLY',
      settled_mode: 'INSTALLMENT',
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

    const calculationType = values.interest_calculation_type;
    const applicationDate = values.application_date;
    const disbursementDate = values.disbursement_date;
    if (disbursementDate.isBefore(applicationDate, 'day')) {
      message.error(t('cooperative.loans.validation.disbursementBeforeApplication'));
      return;
    }
    const frequency = calculationType === 'TOTAL_PERCENT'
      ? (values.billing_frequency ?? 'MONTHLY')
      : 'MONTHLY';
    const firstDueDate = getFirstScheduledDueDate({
      disbursementDate,
      frequency,
      weekday: schedules[0].weekday,
    });

    try {
      const commonInput = {
        member_id: values.member_id,
        principal_amount: Number(values.principal_amount || 0),
        interest_calculation_type: calculationType,
        application_date: applicationDate.toISOString(),
        notes: values.notes,
      };
      const schemeInput = calculationType === 'TOTAL_PERCENT'
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
        first_due_date: firstDueDate.toISOString(),
        settled_through_installment_number: values.settled_mode === 'INSTALLMENT'
          ? Number(values.settled_through_installment_number ?? 0)
          : undefined,
        migration_outstanding_principal_amount: values.settled_mode === 'PRINCIPAL'
          ? Number(values.outstanding_principal_amount ?? 0)
          : undefined,
        migration_outstanding_interest_amount: values.settled_mode === 'PRINCIPAL' && values.outstanding_interest_amount != null
          ? Number(values.outstanding_interest_amount)
          : undefined,
      });

      message.success(t('cooperative.loans.migration.success'));
      closeModal();
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('cooperative.loans.migration.failed'));
    }
  };

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
        <Button type="link" onClick={() => setSelectedLoan(loan)}>
          {t('cooperative.loans.view')}
        </Button>
      ),
    },
  ], [setSelectedLoan, statusLabels, t]);

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
