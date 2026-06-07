import { useState } from 'react';
import { App, Button, Card, Form, Input, Select } from 'antd';
import { Building2, Plus } from 'lucide-react';
import { useDepartments, type DepartmentStatusFilter } from '@/hooks/useDepartments';
import { useI18n } from '@/hooks/useI18n';
import type { Department } from '@/types';
import DepartmentFormModal, { type DepartmentFormValues } from './DepartmentFormModal';
import DepartmentTable from './DepartmentTable';

export default function DepartmentManagement() {
  const { message, modal } = App.useApp();
  const { t } = useI18n();
  const [form] = Form.useForm<DepartmentFormValues>();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const {
    filteredDepartments,
    editingDepartment,
    searchText,
    setSearchText,
    statusFilter,
    setStatusFilter,
    handleEdit,
    resetForm,
    submitForm,
    archiveDepartment,
    restoreDepartment,
    isSubmitting,
  } = useDepartments();

  const closeModal = () => {
    setIsModalOpen(false);
    resetForm();
    form.resetFields();
  };

  const openAddModal = () => {
    resetForm();
    form.resetFields();
    form.setFieldsValue({ is_active: true });
    setIsModalOpen(true);
  };

  const openEditModal = (department: Department) => {
    handleEdit(department);
    form.resetFields();
    form.setFieldsValue({
      name: department.name,
      code: department.code,
      description: department.description,
      is_active: department.is_active,
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (values: DepartmentFormValues) => {
    try {
      const wasEditing = Boolean(editingDepartment);
      await submitForm(values);
      message.success(wasEditing ? t('departments.updateSuccess') : t('departments.createSuccess'));
      closeModal();
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('departments.saveFailed'));
    }
  };

  const handleArchive = (department: Department) => {
    modal.confirm({
      title: t('departments.archiveConfirmTitle'),
      content: t('departments.archiveConfirmContent', { name: department.name }),
      okText: t('departments.archive'),
      okType: 'danger',
      cancelText: t('common.cancel'),
      onOk: async () => {
        try {
          await archiveDepartment(department.id);
          message.success(t('departments.archiveSuccess'));
        } catch (error) {
          message.error(error instanceof Error ? error.message : t('departments.archiveFailed'));
        }
      },
    });
  };

  const handleRestore = async (department: Department) => {
    try {
      await restoreDepartment(department.id);
      message.success(t('departments.restoreSuccess'));
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('departments.restoreFailed'));
    }
  };

  return (
    <Card
      className="shadow-md"
      title={(
        <div className="flex items-center gap-2">
          <Building2 className="h-5 w-5" />
          {t('departments.title')}
        </div>
      )}
      extra={(
        <Button type="primary" icon={<Plus size={16} />} onClick={openAddModal}>
          {t('departments.add')}
        </Button>
      )}
    >
      <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-[minmax(240px,1fr)_180px]">
        <Input.Search
          allowClear
          value={searchText}
          placeholder={t('departments.searchPlaceholder')}
          onChange={(event) => setSearchText(event.target.value)}
        />
        <Select<DepartmentStatusFilter>
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { value: 'active', label: t('departments.filter.active') },
            { value: 'inactive', label: t('departments.filter.inactive') },
            { value: 'all', label: t('departments.filter.allStatuses') },
          ]}
        />
      </div>

      <DepartmentTable
        departments={filteredDepartments}
        onEdit={openEditModal}
        onArchive={handleArchive}
        onRestore={handleRestore}
      />
      <DepartmentFormModal
        form={form}
        open={isModalOpen}
        isEditing={Boolean(editingDepartment)}
        isSubmitting={isSubmitting}
        onCancel={closeModal}
        onSubmit={handleSubmit}
      />
    </Card>
  );
}
