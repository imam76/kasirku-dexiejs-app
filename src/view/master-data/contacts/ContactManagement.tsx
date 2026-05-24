import { useState } from 'react';
import { App, Button, Card, Form, Input, Modal, Select, Space, Switch, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { Archive, Edit2, Plus, RotateCcw, Users } from 'lucide-react';
import { useContacts, type ContactStatusFilter, type ContactTypeFilter } from '@/hooks/useContacts';
import { useI18n } from '@/hooks/useI18n';
import type { Contact, ContactType } from '@/types';

const { Text } = Typography;
const { TextArea } = Input;

const contactTypeOptions: Array<{ value: ContactType; labelKey: string; color: string }> = [
  { value: 'CUSTOMER', labelKey: 'contacts.type.customer', color: 'green' },
  { value: 'SUPPLIER', labelKey: 'contacts.type.supplier', color: 'blue' },
  { value: 'CUSTOMER_SUPPLIER', labelKey: 'contacts.type.customerSupplier', color: 'purple' },
  { value: 'OTHER', labelKey: 'contacts.type.other', color: 'default' },
];

export default function ContactManagement() {
  const { message, modal } = App.useApp();
  const { t } = useI18n();
  const [form] = Form.useForm<ContactFormValues>();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const {
    filteredContacts,
    editingContact,
    searchText,
    setSearchText,
    typeFilter,
    setTypeFilter,
    statusFilter,
    setStatusFilter,
    handleEdit,
    resetForm,
    submitForm,
    archiveContact,
    restoreContact,
    isSubmitting,
  } = useContacts();

  const typeLabelMap = contactTypeOptions.reduce<Record<ContactType, string>>((acc, option) => {
    acc[option.value] = t(option.labelKey as Parameters<typeof t>[0]);
    return acc;
  }, {} as Record<ContactType, string>);

  const closeModal = () => {
    setIsModalOpen(false);
    resetForm();
    form.resetFields();
  };

  const openAddModal = () => {
    resetForm();
    form.resetFields();
    form.setFieldsValue({
      contact_type: 'CUSTOMER',
      is_active: true,
    });
    setIsModalOpen(true);
  };

  const openEditModal = (contact: Contact) => {
    handleEdit(contact);
    form.resetFields();
    form.setFieldsValue({
      name: contact.name,
      contact_type: contact.contact_type,
      phone: contact.phone,
      email: contact.email,
      company_name: contact.company_name,
      address: contact.address,
      tax_number: contact.tax_number,
      notes: contact.notes,
      is_active: contact.is_active,
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (values: ContactFormValues) => {
    try {
      const wasEditing = Boolean(editingContact);
      await submitForm(values);
      message.success(wasEditing ? t('contacts.updateSuccess') : t('contacts.createSuccess'));
      closeModal();
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('contacts.saveFailed'));
    }
  };

  const handleArchive = (contact: Contact) => {
    modal.confirm({
      title: t('contacts.archiveConfirmTitle'),
      content: t('contacts.archiveConfirmContent', { name: contact.name }),
      okText: t('contacts.archive'),
      okType: 'danger',
      cancelText: t('common.cancel'),
      onOk: async () => {
        try {
          await archiveContact(contact.id);
          message.success(t('contacts.archiveSuccess'));
        } catch (error) {
          message.error(error instanceof Error ? error.message : t('contacts.archiveFailed'));
        }
      },
    });
  };

  const handleRestore = async (contact: Contact) => {
    try {
      await restoreContact(contact.id);
      message.success(t('contacts.restoreSuccess'));
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('contacts.restoreFailed'));
    }
  };

  const columns: ColumnsType<Contact> = [
    {
      title: t('contacts.table.name'),
      dataIndex: 'name',
      key: 'name',
      render: (name: string, contact) => (
        <Space direction="vertical" size={0}>
          <Text strong>{name}</Text>
          {contact.company_name && <Text type="secondary">{contact.company_name}</Text>}
        </Space>
      ),
    },
    {
      title: t('contacts.table.type'),
      dataIndex: 'contact_type',
      key: 'contact_type',
      render: (contactType: ContactType) => {
        const option = contactTypeOptions.find((item) => item.value === contactType);
        return <Tag color={option?.color}>{typeLabelMap[contactType]}</Tag>;
      },
    },
    {
      title: t('contacts.table.phone'),
      dataIndex: 'phone',
      key: 'phone',
      render: (phone?: string) => phone || '-',
    },
    {
      title: t('contacts.table.email'),
      dataIndex: 'email',
      key: 'email',
      render: (email?: string) => email || '-',
    },
    {
      title: t('contacts.table.status'),
      dataIndex: 'is_active',
      key: 'is_active',
      render: (isActive: boolean) => (
        <Tag color={isActive ? 'green' : 'default'}>
          {isActive ? t('contacts.status.active') : t('contacts.status.inactive')}
        </Tag>
      ),
    },
    {
      title: t('contacts.table.action'),
      key: 'action',
      render: (_value: unknown, contact) => (
        <Space wrap>
          <Button type="text" icon={<Edit2 size={16} />} onClick={() => openEditModal(contact)}>
            {t('contacts.edit')}
          </Button>
          {contact.is_active ? (
            <Button danger type="text" icon={<Archive size={16} />} onClick={() => handleArchive(contact)}>
              {t('contacts.archive')}
            </Button>
          ) : (
            <Button type="text" icon={<RotateCcw size={16} />} onClick={() => handleRestore(contact)}>
              {t('contacts.restore')}
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
          <Users className="h-5 w-5" />
          {t('contacts.title')}
        </div>
      )}
      extra={(
        <Button type="primary" icon={<Plus size={16} />} onClick={openAddModal}>
          {t('contacts.add')}
        </Button>
      )}
    >
      <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-[minmax(240px,1fr)_220px_180px]">
        <Input.Search
          allowClear
          value={searchText}
          placeholder={t('contacts.searchPlaceholder')}
          onChange={(event) => setSearchText(event.target.value)}
        />
        <Select<ContactTypeFilter>
          value={typeFilter}
          onChange={setTypeFilter}
          options={[
            { value: 'ALL', label: t('contacts.filter.allTypes') },
            ...contactTypeOptions.map((option) => ({
              value: option.value,
              label: t(option.labelKey as Parameters<typeof t>[0]),
            })),
          ]}
        />
        <Select<ContactStatusFilter>
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { value: 'active', label: t('contacts.filter.active') },
            { value: 'inactive', label: t('contacts.filter.inactive') },
            { value: 'all', label: t('contacts.filter.allStatuses') },
          ]}
        />
      </div>

      <Table
        dataSource={filteredContacts}
        columns={columns}
        rowKey="id"
        pagination={{ pageSize: 8 }}
        scroll={{ x: true }}
        locale={{ emptyText: t('contacts.empty') }}
      />

      <Modal
        title={editingContact ? t('contacts.editTitle') : t('contacts.addTitle')}
        open={isModalOpen}
        onCancel={closeModal}
        onOk={() => form.submit()}
        confirmLoading={isSubmitting}
        destroyOnHidden
        forceRender
        width={760}
      >
        <Form<ContactFormValues>
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          requiredMark={false}
          className="mt-4"
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Form.Item name="name" label={t('contacts.form.name')} rules={[{ required: true, whitespace: true, message: t('contacts.validation.nameRequired') }]}>
              <Input placeholder={t('contacts.form.namePlaceholder')} />
            </Form.Item>
            <Form.Item name="contact_type" label={t('contacts.form.type')} rules={[{ required: true, message: t('contacts.validation.typeRequired') }]}>
              <Select
                options={contactTypeOptions.map((option) => ({
                  value: option.value,
                  label: t(option.labelKey as Parameters<typeof t>[0]),
                }))}
              />
            </Form.Item>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Form.Item name="phone" label={t('contacts.form.phone')}>
              <Input placeholder={t('contacts.form.phonePlaceholder')} />
            </Form.Item>
            <Form.Item name="email" label={t('contacts.form.email')} rules={[{ type: 'email', message: t('contacts.validation.emailInvalid') }]}>
              <Input placeholder={t('contacts.form.emailPlaceholder')} />
            </Form.Item>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Form.Item name="company_name" label={t('contacts.form.company')}>
              <Input placeholder={t('contacts.form.companyPlaceholder')} />
            </Form.Item>
            <Form.Item name="tax_number" label={t('contacts.form.taxNumber')}>
              <Input placeholder={t('contacts.form.taxNumberPlaceholder')} />
            </Form.Item>
          </div>

          <Form.Item name="address" label={t('contacts.form.address')}>
            <TextArea rows={3} placeholder={t('contacts.form.addressPlaceholder')} />
          </Form.Item>
          <Form.Item name="notes" label={t('contacts.form.notes')}>
            <TextArea rows={3} placeholder={t('contacts.form.notesPlaceholder')} />
          </Form.Item>
          <Form.Item name="is_active" label={t('contacts.form.status')} valuePropName="checked">
            <Switch checkedChildren={t('contacts.status.active')} unCheckedChildren={t('contacts.status.inactive')} />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}

interface ContactFormValues {
  name: string;
  contact_type: ContactType;
  phone?: string;
  email?: string;
  address?: string;
  company_name?: string;
  tax_number?: string;
  notes?: string;
  is_active?: boolean;
}
