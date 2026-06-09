import { useState } from 'react';
import { App, Button, Card, Form, Input, Select } from 'antd';
import { Plus, UserRoundCog } from 'lucide-react';
import { useEmployees, type EmployeeStatusFilter, type EmployeeWithAreas } from '@/hooks/useEmployees';
import { useI18n } from '@/hooks/useI18n';
import { useAuth } from '@/auth/useAuth';
import EmployeeFormModal, { type EmployeeFormValues } from './EmployeeFormModal';
import EmployeeTable from './EmployeeTable';

export default function EmployeeManagement() {
  const { message, modal } = App.useApp();
  const { t } = useI18n();
  const { can, refreshCurrentUser } = useAuth();
  const [form] = Form.useForm<EmployeeFormValues>();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const {
    areas,
    authUsers,
    roles,
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
    form.setFieldsValue({ area_ids: [], create_login: false, reset_login_pin: false, is_active: true });
    setIsModalOpen(true);
  };

  const openEditModal = (employee: EmployeeWithAreas) => {
    handleEdit(employee);
    const linkedUser = authUsers.find((user) => user.id === employee.user_id);
    const linkedRoleId = linkedUser?.role_id ?? roles.find((role) => role.code === linkedUser?.role)?.id;
    form.resetFields();
    form.setFieldsValue({
      name: employee.name,
      phone: employee.phone,
      email: employee.email,
      address: employee.address,
      position: employee.position,
      user_id: employee.user_id,
      login_role_id: linkedRoleId,
      area_ids: employee.area_assignments.map((assignment) => assignment.area_id),
      notes: employee.notes,
      is_active: employee.is_active,
      create_login: false,
      reset_login_pin: false,
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (values: EmployeeFormValues) => {
    try {
      const wasEditing = Boolean(editingEmployee);
      const payload = can('USER_MANAGE')
        ? values
        : {
          ...values,
          user_id: editingEmployee?.user_id,
          create_login: false,
          login_role_id: undefined,
          login_pin: undefined,
          confirm_login_pin: undefined,
          reset_login_pin: false,
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
        authUsers={authUsers}
        roles={roles}
        open={isModalOpen}
        isEditing={Boolean(editingEmployee)}
        canManageLogin={can('USER_MANAGE')}
        isSubmitting={isSubmitting}
        onCancel={closeModal}
        onSubmit={handleSubmit}
      />
    </Card>
  );
}
