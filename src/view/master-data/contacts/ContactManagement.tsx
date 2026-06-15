import { useState } from 'react';
import { App, Button, Card, Form, Input, Select } from 'antd';
import { Plus, Users } from 'lucide-react';
import { useContacts, type ContactMembershipFilter, type ContactStatusFilter, type ContactTypeFilter } from '@/hooks/useContacts';
import { useI18n } from '@/hooks/useI18n';
import type { Contact } from '@/types';
import ContactFormModal, { type ContactFormValues } from './ContactFormModal';
import ContactTable from './ContactTable';
import { contactTypeOptions } from './contactOptions';

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
    membershipFilter,
    setMembershipFilter,
    handleEdit,
    resetForm,
    submitForm,
    archiveContact,
    restoreContact,
    isSubmitting,
  } = useContacts();

  const closeModal = () => {
    setIsModalOpen(false);
    resetForm();
    form.resetFields();
  };

  const openAddModal = () => {
    resetForm();
    form.resetFields();
    form.setFieldsValue({ contact_type: 'CUSTOMER', is_active: true, is_member: false, membership_status: 'ACTIVE' });
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
      is_member: contact.is_member,
      membership_number: contact.membership_number,
      membership_status: contact.membership_status ?? 'ACTIVE',
      membership_joined_at: contact.membership_joined_at,
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
      <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-[minmax(240px,1fr)_220px_180px_180px]">
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
            ...contactTypeOptions.map((option) => ({ value: option.value, label: t(option.labelKey) })),
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
        <Select<ContactMembershipFilter>
          value={membershipFilter}
          onChange={setMembershipFilter}
          options={[
            { value: 'all', label: 'Semua membership' },
            { value: 'members', label: 'Member' },
            { value: 'non_members', label: 'Non-member' },
          ]}
        />
      </div>

      <ContactTable
        contacts={filteredContacts}
        onEdit={openEditModal}
        onArchive={handleArchive}
        onRestore={handleRestore}
      />
      <ContactFormModal
        form={form}
        open={isModalOpen}
        isEditing={Boolean(editingContact)}
        isSubmitting={isSubmitting}
        onCancel={closeModal}
        onSubmit={handleSubmit}
      />
    </Card>
  );
}
