import { useState } from 'react';
import { App, Button, Card, Form, Input, Select } from 'antd';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, UserRoundCog } from 'lucide-react';
import { useEmployees, type EmployeeStatusFilter, type EmployeeWithAreas } from '@/hooks/useEmployees';
import { useI18n } from '@/hooks/useI18n';
import { useAuth } from '@/auth/useAuth';
import { createCooperativeAreaWithGeneratedCode } from '@/services/cooperativeAreaService';
import { createFieldCashAccountForEmployee } from '@/services/employeeService';
import dayjs from '@/lib/dayjs';
import EmployeeFormModal, { type EmployeeFormValues } from './EmployeeFormModal';
import EmployeeTable from './EmployeeTable';

export default function EmployeeManagement() {
  const { message, modal } = App.useApp();
  const { t } = useI18n();
  const { can, refreshCurrentUser } = useAuth();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<EmployeeFormValues>();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCreatingArea, setIsCreatingArea] = useState(false);
  const [isCreatingFieldCashAccount, setIsCreatingFieldCashAccount] = useState(false);
  const {
    areas,
    roles,
    fieldCashAccounts,
    filteredEmployees,
    editingEmployee,
    searchText,
    setSearchText,
    statusFilter,
    setStatusFilter,
    handleEdit,
    resetForm,
    submitForm,
    archiveEmployee,
    restoreEmployee,
    isSubmitting,
  } = useEmployees();

  const closeModal = () => {
    setIsModalOpen(false);
    resetForm();
    form.resetFields();
  };

  const openAddModal = () => {
    resetForm();
    form.resetFields();
    form.setFieldsValue({ area_ids: [], collection_schedules: [], is_active: true });
    setIsModalOpen(true);
  };

  const openEditModal = (employee: EmployeeWithAreas) => {
    handleEdit(employee);
    form.resetFields();
    form.setFieldsValue({
      name: employee.name,
      phone: employee.phone,
      email: employee.email,
      address: employee.address,
      position: employee.position,
      login_role_id: employee.login_role_id,
      field_cash_account_id: employee.field_cash_account_id,
      area_ids: employee.area_assignments.map((assignment) => assignment.area_id),
      collection_schedules: employee.collection_schedules.map((schedule) => ({
        id: schedule.id,
        area_id: schedule.area_id,
        weekday: schedule.weekday,
        effective_from: schedule.effective_from ? dayjs(schedule.effective_from).tz() : undefined,
        effective_until: schedule.effective_until ? dayjs(schedule.effective_until).tz() : undefined,
        is_active: schedule.is_active,
      })),
      notes: employee.notes,
      is_active: employee.is_active,
    });
    setIsModalOpen(true);
  };

  const handleCreateFieldCashAccount = async (employeeName: string) => {
    try {
      setIsCreatingFieldCashAccount(true);
      const account = await createFieldCashAccountForEmployee({ employee_name: employeeName });
      message.success(`Akun kas petugas ${account.code} berhasil dibuat.`);
      return account;
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Gagal membuat akun kas petugas.');
      return undefined;
    } finally {
      setIsCreatingFieldCashAccount(false);
    }
  };

  const handleCreateArea = async (areaName: string) => {
    try {
      setIsCreatingArea(true);
      const area = await createCooperativeAreaWithGeneratedCode({
        name: areaName,
        source: 'employee',
      });
      const currentAreaIds = form.getFieldValue('area_ids') ?? [];
      form.setFieldsValue({
        area_ids: Array.from(new Set([...currentAreaIds, area.id])),
      });
      queryClient.invalidateQueries({ queryKey: ['cooperativeAreas'] });
      message.success(t('areas.quickCreateSuccess', { code: area.code ?? area.name }));
      return true;
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('areas.quickCreateFailed'));
      return false;
    } finally {
      setIsCreatingArea(false);
    }
  };

  const handleSubmit = async (values: EmployeeFormValues) => {
    try {
      const wasEditing = Boolean(editingEmployee);
      const normalizedValues = {
        ...values,
        collection_schedules: values.collection_schedules?.map((schedule) => ({
          ...schedule,
          effective_from: schedule.effective_from?.startOf('day').toISOString(),
          effective_until: schedule.effective_until?.endOf('day').toISOString(),
        })),
      };
      const payload = can('USER_MANAGE')
        ? normalizedValues
        : {
          ...normalizedValues,
          login_role_id: undefined,
          login_pin: undefined,
          confirm_login_pin: undefined,
        };
      await submitForm(payload);
      await refreshCurrentUser();
      message.success(wasEditing ? t('employees.updateSuccess') : t('employees.createSuccess'));
      closeModal();
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('employees.saveFailed'));
    }
  };

  const handleArchive = (employee: EmployeeWithAreas) => {
    modal.confirm({
      title: t('employees.archiveConfirmTitle'),
      content: t('employees.archiveConfirmContent', { name: employee.name }),
      okText: t('employees.archive'),
      okType: 'danger',
      cancelText: t('common.cancel'),
      onOk: async () => {
        try {
          await archiveEmployee(employee.id);
          message.success(t('employees.archiveSuccess'));
        } catch (error) {
          message.error(error instanceof Error ? error.message : t('employees.archiveFailed'));
        }
      },
    });
  };

  const handleRestore = async (employee: EmployeeWithAreas) => {
    try {
      await restoreEmployee(employee.id);
      message.success(t('employees.restoreSuccess'));
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('employees.restoreFailed'));
    }
  };

  return (
    <Card
      className="shadow-md"
      title={(
        <div className="flex items-center gap-2">
          <UserRoundCog className="h-5 w-5" />
          {t('employees.title')}
        </div>
      )}
      extra={(
        <Button type="primary" icon={<Plus size={16} />} onClick={openAddModal}>
          {t('employees.add')}
        </Button>
      )}
    >
      <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-[minmax(240px,1fr)_180px]">
        <Input.Search
          allowClear
          value={searchText}
          placeholder={t('employees.searchPlaceholder')}
          onChange={(event) => setSearchText(event.target.value)}
        />
        <Select<EmployeeStatusFilter>
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { value: 'active', label: t('employees.filter.active') },
            { value: 'inactive', label: t('employees.filter.inactive') },
            { value: 'all', label: t('employees.filter.allStatuses') },
          ]}
        />
      </div>

      <EmployeeTable
        employees={filteredEmployees}
        onEdit={openEditModal}
        onArchive={handleArchive}
        onRestore={handleRestore}
      />
      <EmployeeFormModal
        form={form}
        areas={areas}
        roles={roles}
        fieldCashAccounts={fieldCashAccounts}
        open={isModalOpen}
        isEditing={Boolean(editingEmployee)}
        canManageLogin={can('USER_MANAGE')}
        isSubmitting={isSubmitting}
        isCreatingFieldCashAccount={isCreatingFieldCashAccount}
        isCreatingArea={isCreatingArea}
        onCancel={closeModal}
        onSubmit={handleSubmit}
        onCreateFieldCashAccount={handleCreateFieldCashAccount}
        onCreateArea={handleCreateArea}
      />
    </Card>
  );
}
