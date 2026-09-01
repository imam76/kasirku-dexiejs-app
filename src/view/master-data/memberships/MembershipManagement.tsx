import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { App, Button, Card, Form, Input, Select } from 'antd';
import { Plus, Users } from 'lucide-react';
import { db } from '@/lib/db';
import { useMemberships, type MembershipStatusFilter } from '@/hooks/useMemberships';
import { useI18n } from '@/hooks/useI18n';
import type { Membership } from '@/types';
import MembershipFormModal, { type MembershipFormValues } from './MembershipFormModal';
import MembershipTable from './MembershipTable';

export default function MembershipManagement() {
  const { message, modal } = App.useApp();
  const { t } = useI18n();
  const [form] = Form.useForm<MembershipFormValues>();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const {
    filteredMemberships,
    isLoading,
    editingMembership,
    searchText,
    setSearchText,
    statusFilter,
    setStatusFilter,
    handleEdit,
    resetForm,
    submitForm,
    archiveMembership,
    restoreMembership,
    isSubmitting,
  } = useMemberships();

  const queriedContacts = useLiveQuery(() => db.contacts.orderBy('name').toArray(), []);
  const contacts = useMemo(() => queriedContacts ?? [], [queriedContacts]);
  const contactsById = useMemo(() => new Map(contacts.map((contact) => [contact.id, contact])), [contacts]);

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

  const openEditModal = (membership: Membership) => {
    handleEdit(membership);
    form.resetFields();
    form.setFieldsValue({
      phone: membership.phone,
      name: membership.name,
      email: membership.email,
      contact_id: membership.contact_id,
      status: membership.status,
      is_active: membership.is_active,
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (values: MembershipFormValues) => {
    try {
      const wasEditing = Boolean(editingMembership);
      await submitForm(values);
      message.success(wasEditing ? t('members.updateSuccess') : t('members.createSuccess'));
      closeModal();
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('members.saveFailed'));
    }
  };

  const handleArchive = (membership: Membership) => {
    modal.confirm({
      title: t('members.archiveConfirmTitle'),
      content: t('members.archiveConfirmContent', { name: membership.name ?? membership.phone }),
      okText: t('members.archive'),
      okType: 'danger',
      cancelText: t('common.cancel'),
      onOk: async () => {
        try {
          await archiveMembership(membership.id);
          message.success(t('members.archiveSuccess'));
        } catch (error) {
          message.error(error instanceof Error ? error.message : t('members.archiveFailed'));
        }
      },
    });
  };

  const handleRestore = async (membership: Membership) => {
    try {
      await restoreMembership(membership.id);
      message.success(t('members.restoreSuccess'));
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('members.restoreFailed'));
    }
  };

  return (
    <Card
      className="shadow-md"
      title={(
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          {t('members.title')}
        </div>
      )}
      extra={(
        <Button type="primary" icon={<Plus size={16} />} onClick={openAddModal}>
          {t('members.add')}
        </Button>
      )}
    >
      <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-[minmax(240px,1fr)_180px]">
        <Input.Search
          allowClear
          value={searchText}
          placeholder={t('members.filter.searchPlaceholder')}
          onChange={(event) => setSearchText(event.target.value)}
        />
        <Select<MembershipStatusFilter>
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { value: 'active', label: t('members.filter.active') },
            { value: 'inactive', label: t('members.filter.inactive') },
            { value: 'all', label: t('members.filter.allStatuses') },
          ]}
        />
      </div>

      <MembershipTable
        memberships={filteredMemberships}
        contactsById={contactsById}
        loading={isLoading}
        onEdit={openEditModal}
        onArchive={handleArchive}
        onRestore={handleRestore}
      />
      <MembershipFormModal
        form={form}
        open={isModalOpen}
        isEditing={Boolean(editingMembership)}
        isSubmitting={isSubmitting}
        contacts={contacts}
        onCancel={closeModal}
        onSubmit={handleSubmit}
      />
    </Card>
  );
}
