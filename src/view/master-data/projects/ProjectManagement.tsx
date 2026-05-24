import { useState } from 'react';
import { App, Button, Card, DatePicker, Form, Input, InputNumber, Modal, Select, Space, Switch, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { Dayjs } from 'dayjs';
import { Archive, Briefcase, Edit2, Plus, RotateCcw } from 'lucide-react';
import dayjs from '@/lib/dayjs';
import { useProjects, type ProjectActiveFilter, type ProjectStatusFilter } from '@/hooks/useProjects';
import { useI18n } from '@/hooks/useI18n';
import type { Contact, Department, Project, ProjectStatus } from '@/types';
import { formatCurrency } from '@/utils/formatters';

const { Text } = Typography;
const { TextArea } = Input;

const projectStatusOptions: Array<{ value: ProjectStatus; labelKey: string; color: string }> = [
  { value: 'PLANNED', labelKey: 'projects.status.planned', color: 'default' },
  { value: 'ACTIVE', labelKey: 'projects.status.active', color: 'green' },
  { value: 'ON_HOLD', labelKey: 'projects.status.onHold', color: 'orange' },
  { value: 'COMPLETED', labelKey: 'projects.status.completed', color: 'blue' },
  { value: 'CANCELLED', labelKey: 'projects.status.cancelled', color: 'red' },
];

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

  const statusLabelMap = projectStatusOptions.reduce<Record<ProjectStatus, string>>((acc, option) => {
    acc[option.value] = t(option.labelKey as Parameters<typeof t>[0]);
    return acc;
  }, {} as Record<ProjectStatus, string>);

  const contactOptions = activeContacts.map((contact) => ({
    value: contact.id,
    label: getContactLabel(contact),
  }));
  const departmentOptions = activeDepartments.map((department) => ({
    value: department.id,
    label: getDepartmentLabel(department),
  }));

  const closeModal = () => {
    setIsModalOpen(false);
    resetForm();
    form.resetFields();
  };

  const openAddModal = () => {
    resetForm();
    form.resetFields();
    form.setFieldsValue({
      status: 'ACTIVE',
      is_active: true,
    });
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

  const columns: ColumnsType<Project> = [
    {
      title: t('projects.table.name'),
      dataIndex: 'name',
      key: 'name',
      render: (name: string, project) => (
        <Space direction="vertical" size={0}>
          <Text strong>{name}</Text>
          {project.code && <Text type="secondary">{project.code}</Text>}
        </Space>
      ),
    },
    {
      title: t('projects.table.status'),
      dataIndex: 'status',
      key: 'status',
      render: (status: ProjectStatus) => {
        const option = projectStatusOptions.find((item) => item.value === status);
        return <Tag color={option?.color}>{statusLabelMap[status]}</Tag>;
      },
    },
    {
      title: t('projects.table.contact'),
      dataIndex: 'contact_name',
      key: 'contact_name',
      render: (contactName?: string) => contactName || '-',
    },
    {
      title: t('projects.table.department'),
      key: 'department',
      render: (_value: unknown, project) => project.department_name
        ? `${project.department_name}${project.department_code ? ` (${project.department_code})` : ''}`
        : '-',
    },
    {
      title: t('projects.table.period'),
      key: 'period',
      render: (_value: unknown, project) => getPeriodLabel(project),
    },
    {
      title: t('projects.table.budget'),
      dataIndex: 'budget_amount',
      key: 'budget_amount',
      align: 'right',
      render: (budget?: number) => budget === undefined ? '-' : `Rp ${formatCurrency(budget)}`,
    },
    {
      title: t('projects.table.activeStatus'),
      dataIndex: 'is_active',
      key: 'is_active',
      render: (isActive: boolean) => (
        <Tag color={isActive ? 'green' : 'default'}>
          {isActive ? t('projects.activeStatus.active') : t('projects.activeStatus.inactive')}
        </Tag>
      ),
    },
    {
      title: t('projects.table.action'),
      key: 'action',
      render: (_value: unknown, project) => (
        <Space wrap>
          <Button type="text" icon={<Edit2 size={16} />} onClick={() => openEditModal(project)}>
            {t('projects.edit')}
          </Button>
          {project.is_active ? (
            <Button danger type="text" icon={<Archive size={16} />} onClick={() => handleArchive(project)}>
              {t('projects.archive')}
            </Button>
          ) : (
            <Button type="text" icon={<RotateCcw size={16} />} onClick={() => handleRestore(project)}>
              {t('projects.restore')}
            </Button>
          )}
        </Space>
      ),
    },
  ];

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
            ...projectStatusOptions.map((option) => ({
              value: option.value,
              label: t(option.labelKey as Parameters<typeof t>[0]),
            })),
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

      <Table
        dataSource={filteredProjects}
        columns={columns}
        rowKey="id"
        pagination={{ pageSize: 8 }}
        scroll={{ x: true }}
        locale={{ emptyText: t('projects.empty') }}
      />

      <Modal
        title={editingProject ? t('projects.editTitle') : t('projects.addTitle')}
        open={isModalOpen}
        onCancel={closeModal}
        onOk={() => form.submit()}
        confirmLoading={isSubmitting}
        destroyOnHidden
        forceRender
        width={820}
      >
        <Form<ProjectFormValues>
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          requiredMark={false}
          className="mt-4"
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Form.Item name="name" label={t('projects.form.name')} rules={[{ required: true, whitespace: true, message: t('projects.validation.nameRequired') }]}>
              <Input placeholder={t('projects.form.namePlaceholder')} />
            </Form.Item>
            <Form.Item name="code" label={t('projects.form.code')} rules={[{ max: 30, message: t('projects.validation.codeMax') }]}>
              <Input placeholder={t('projects.form.codePlaceholder')} />
            </Form.Item>
            <Form.Item name="status" label={t('projects.form.status')} rules={[{ required: true, message: t('projects.validation.statusRequired') }]}>
              <Select
                options={projectStatusOptions.map((option) => ({
                  value: option.value,
                  label: t(option.labelKey as Parameters<typeof t>[0]),
                }))}
              />
            </Form.Item>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Form.Item name="contact_id" label={t('projects.form.contact')}>
              <Select allowClear showSearch optionFilterProp="label" options={contactOptions} placeholder={t('projects.form.contactPlaceholder')} />
            </Form.Item>
            <Form.Item name="department_id" label={t('projects.form.department')}>
              <Select allowClear showSearch optionFilterProp="label" options={departmentOptions} placeholder={t('projects.form.departmentPlaceholder')} />
            </Form.Item>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Form.Item name="start_date" label={t('projects.form.startDate')}>
              <DatePicker className="w-full" />
            </Form.Item>
            <Form.Item
              name="end_date"
              label={t('projects.form.endDate')}
              dependencies={['start_date']}
              rules={[
                ({ getFieldValue }) => ({
                  validator(_, value: Dayjs | null) {
                    const startDate = getFieldValue('start_date') as Dayjs | null;
                    if (!startDate || !value || !value.isBefore(startDate, 'day')) {
                      return Promise.resolve();
                    }
                    return Promise.reject(new Error(t('projects.validation.endDateAfterStart')));
                  },
                }),
              ]}
            >
              <DatePicker className="w-full" />
            </Form.Item>
            <Form.Item name="budget_amount" label={t('projects.form.budget')} rules={[{ type: 'number', min: 0, message: t('projects.validation.budgetMin') }]}>
              <InputNumber min={0} className="w-full" prefix="Rp" />
            </Form.Item>
          </div>

          <Form.Item name="description" label={t('projects.form.description')}>
            <TextArea rows={3} placeholder={t('projects.form.descriptionPlaceholder')} />
          </Form.Item>
          <Form.Item name="is_active" label={t('projects.form.activeStatus')} valuePropName="checked">
            <Switch checkedChildren={t('projects.activeStatus.active')} unCheckedChildren={t('projects.activeStatus.inactive')} />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}

interface ProjectFormValues {
  name: string;
  code?: string;
  status: ProjectStatus;
  contact_id?: string;
  department_id?: string;
  start_date?: Dayjs | null;
  end_date?: Dayjs | null;
  budget_amount?: number;
  description?: string;
  is_active?: boolean;
}

const getContactLabel = (contact: Contact) => {
  return contact.company_name ? `${contact.name} (${contact.company_name})` : contact.name;
};

const getDepartmentLabel = (department: Department) => {
  return department.code ? `${department.name} (${department.code})` : department.name;
};

const getPeriodLabel = (project: Project) => {
  if (!project.start_date && !project.end_date) return '-';

  const startDate = project.start_date ? dayjs(project.start_date).format('DD MMM YYYY') : '-';
  const endDate = project.end_date ? dayjs(project.end_date).format('DD MMM YYYY') : '-';

  return `${startDate} - ${endDate}`;
};
