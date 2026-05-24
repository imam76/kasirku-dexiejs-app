import { useState } from 'react';
import { App, Button, Card, Form, Input, Select } from 'antd';
import { Briefcase, Plus } from 'lucide-react';
import dayjs from '@/lib/dayjs';
import { useProjects, type ProjectActiveFilter, type ProjectStatusFilter } from '@/hooks/useProjects';
import { useI18n } from '@/hooks/useI18n';
import type { Project } from '@/types';
import ProjectFormModal, { type ProjectFormValues } from './ProjectFormModal';
import ProjectTable from './ProjectTable';
import { projectStatusOptions } from './projectOptions';

export default function ProjectManagement() {
  const { message, modal } = App.useApp();
  const { t } = useI18n();
  const [form] = Form.useForm<ProjectFormValues>();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const {
    filteredProjects,
    activeContacts,
    activeDepartments,
    contacts,
    departments,
    editingProject,
    searchText,
    setSearchText,
    statusFilter,
    setStatusFilter,
    activeFilter,
    setActiveFilter,
    handleEdit,
    resetForm,
    submitForm,
    archiveProject,
    restoreProject,
    isSubmitting,
  } = useProjects();

  const closeModal = () => {
    setIsModalOpen(false);
    resetForm();
    form.resetFields();
  };

  const openAddModal = () => {
    resetForm();
    form.resetFields();
    form.setFieldsValue({ status: 'ACTIVE', is_active: true });
    setIsModalOpen(true);
  };

  const openEditModal = (project: Project) => {
    handleEdit(project);
    form.resetFields();
    form.setFieldsValue({
      name: project.name,
      code: project.code,
      status: project.status,
      contact_id: project.contact_id,
      department_id: project.department_id,
      start_date: project.start_date ? dayjs(project.start_date) : null,
      end_date: project.end_date ? dayjs(project.end_date) : null,
      budget_amount: project.budget_amount,
      description: project.description,
      is_active: project.is_active,
    });
    setIsModalOpen(true);
  };

  const toProjectInput = (values: ProjectFormValues) => {
    const selectedContact = values.contact_id
      ? contacts.find((contact) => contact.id === values.contact_id)
      : undefined;
    const selectedDepartment = values.department_id
      ? departments.find((department) => department.id === values.department_id)
      : undefined;

    return {
      name: values.name,
      code: values.code,
      status: values.status,
      contact_id: selectedContact?.id,
      contact_name: selectedContact?.name,
      department_id: selectedDepartment?.id,
      department_code: selectedDepartment?.code,
      department_name: selectedDepartment?.name,
      start_date: values.start_date?.toISOString(),
      end_date: values.end_date?.toISOString(),
      budget_amount: values.budget_amount,
      description: values.description,
      is_active: values.is_active,
    };
  };

  const handleSubmit = async (values: ProjectFormValues) => {
    try {
      const wasEditing = Boolean(editingProject);
      await submitForm(toProjectInput(values));
      message.success(wasEditing ? t('projects.updateSuccess') : t('projects.createSuccess'));
      closeModal();
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('projects.saveFailed'));
    }
  };

  const handleArchive = (project: Project) => {
    modal.confirm({
      title: t('projects.archiveConfirmTitle'),
      content: t('projects.archiveConfirmContent', { name: project.name }),
      okText: t('projects.archive'),
      okType: 'danger',
      cancelText: t('common.cancel'),
      onOk: async () => {
        try {
          await archiveProject(project.id);
          message.success(t('projects.archiveSuccess'));
        } catch (error) {
          message.error(error instanceof Error ? error.message : t('projects.archiveFailed'));
        }
      },
    });
  };

  const handleRestore = async (project: Project) => {
    try {
      await restoreProject(project.id);
      message.success(t('projects.restoreSuccess'));
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('projects.restoreFailed'));
    }
  };

  return (
    <Card
      className="shadow-md"
      title={(
        <div className="flex items-center gap-2">
          <Briefcase className="h-5 w-5" />
          {t('projects.title')}
        </div>
      )}
      extra={(
        <Button type="primary" icon={<Plus size={16} />} onClick={openAddModal}>
          {t('projects.add')}
        </Button>
      )}
    >
      <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-[minmax(240px,1fr)_180px_180px]">
        <Input.Search
          allowClear
          value={searchText}
          placeholder={t('projects.searchPlaceholder')}
          onChange={(event) => setSearchText(event.target.value)}
        />
        <Select<ProjectStatusFilter>
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { value: 'ALL', label: t('projects.filter.allStatuses') },
            ...projectStatusOptions.map((option) => ({ value: option.value, label: t(option.labelKey) })),
          ]}
        />
        <Select<ProjectActiveFilter>
          value={activeFilter}
          onChange={setActiveFilter}
          options={[
            { value: 'active', label: t('projects.filter.active') },
            { value: 'inactive', label: t('projects.filter.inactive') },
            { value: 'all', label: t('projects.filter.allActiveStatuses') },
          ]}
        />
      </div>

      <ProjectTable
        projects={filteredProjects}
        onEdit={openEditModal}
        onArchive={handleArchive}
        onRestore={handleRestore}
      />
      <ProjectFormModal
        form={form}
        open={isModalOpen}
        isEditing={Boolean(editingProject)}
        isSubmitting={isSubmitting}
        activeContacts={activeContacts}
        activeDepartments={activeDepartments}
        onCancel={closeModal}
        onSubmit={handleSubmit}
      />
    </Card>
  );
}
