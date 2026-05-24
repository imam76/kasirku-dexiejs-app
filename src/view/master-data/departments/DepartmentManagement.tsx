import { useState } from 'react';
import { App, Button, Card, Form, Input, Modal, Select, Space, Switch, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { Archive, Building2, Edit2, Plus, RotateCcw } from 'lucide-react';
import { useDepartments, type DepartmentStatusFilter } from '@/hooks/useDepartments';
import { useI18n } from '@/hooks/useI18n';
import type { Department } from '@/types';

const { Text } = Typography;
const { TextArea } = Input;

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

  const columns: ColumnsType<Department> = [
    {
      title: t('departments.table.name'),
      dataIndex: 'name',
      key: 'name',
      render: (name: string, department) => (
        <Space direction="vertical" size={0}>
          <Text strong>{name}</Text>
          {department.code && <Text type="secondary">{department.code}</Text>}
        </Space>
      ),
    },
    {
      title: t('departments.table.code'),
      dataIndex: 'code',
      key: 'code',
      render: (code?: string) => code ? <Tag color="blue">{code}</Tag> : '-',
    },
    {
      title: t('departments.table.description'),
      dataIndex: 'description',
      key: 'description',
      render: (description?: string) => description || '-',
    },
    {
      title: t('departments.table.status'),
      dataIndex: 'is_active',
      key: 'is_active',
      render: (isActive: boolean) => (
        <Tag color={isActive ? 'green' : 'default'}>
          {isActive ? t('departments.status.active') : t('departments.status.inactive')}
        </Tag>
      ),
    },
    {
      title: t('departments.table.action'),
      key: 'action',
      render: (_value: unknown, department) => (
        <Space wrap>
          <Button type="text" icon={<Edit2 size={16} />} onClick={() => openEditModal(department)}>
            {t('departments.edit')}
          </Button>
          {department.is_active ? (
            <Button danger type="text" icon={<Archive size={16} />} onClick={() => handleArchive(department)}>
              {t('departments.archive')}
            </Button>
          ) : (
            <Button type="text" icon={<RotateCcw size={16} />} onClick={() => handleRestore(department)}>
              {t('departments.restore')}
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

      <Table
        dataSource={filteredDepartments}
        columns={columns}
        rowKey="id"
        pagination={{ pageSize: 8 }}
        scroll={{ x: true }}
        locale={{ emptyText: t('departments.empty') }}
      />

      <Modal
        title={editingDepartment ? t('departments.editTitle') : t('departments.addTitle')}
        open={isModalOpen}
        onCancel={closeModal}
        onOk={() => form.submit()}
        confirmLoading={isSubmitting}
        destroyOnHidden
        forceRender
        width={680}
      >
        <Form<DepartmentFormValues>
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          requiredMark={false}
          className="mt-4"
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Form.Item name="name" label={t('departments.form.name')} rules={[{ required: true, whitespace: true, message: t('departments.validation.nameRequired') }]}>
              <Input placeholder={t('departments.form.namePlaceholder')} />
            </Form.Item>
            <Form.Item name="code" label={t('departments.form.code')} rules={[{ max: 20, message: t('departments.validation.codeMax') }]}>
              <Input placeholder={t('departments.form.codePlaceholder')} />
            </Form.Item>
          </div>

          <Form.Item name="description" label={t('departments.form.description')}>
            <TextArea rows={3} placeholder={t('departments.form.descriptionPlaceholder')} />
          </Form.Item>
          <Form.Item name="is_active" label={t('departments.form.status')} valuePropName="checked">
            <Switch checkedChildren={t('departments.status.active')} unCheckedChildren={t('departments.status.inactive')} />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}

interface DepartmentFormValues {
  name: string;
  code?: string;
  description?: string;
  is_active?: boolean;
}
