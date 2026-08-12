import { useMemo, useState } from 'react';
import { App, Button, Card, Form, Input, Select, Tag } from 'antd';
import {
  Archive,
  Building2,
  Edit2,
  Mail,
  MapPin,
  Phone,
  Plus,
  RotateCcw,
  SlidersHorizontal,
  Users,
} from 'lucide-react';
import { GlobalBreadcrumb } from '@/components/GlobalBreadcrumb';
import {
  MobileCrudPageHeader,
  ResponsiveCrudCollection,
  type MobileCrudAction,
} from '@/components/mobile-crud';
import { useContacts, type ContactMembershipFilter, type ContactStatusFilter, type ContactTypeFilter } from '@/hooks/useContacts';
import { useI18n } from '@/hooks/useI18n';
import { useIsMobile } from '@/hooks/useIsMobile';
import type { Contact } from '@/types';
import { formatCurrency } from '@/utils/formatters';
import ContactFormModal, { type ContactFormValues } from './ContactFormModal';
import ContactTable from './ContactTable';
import { contactTypeOptions } from './contactOptions';

export default function ContactManagement() {
  const { message, modal } = App.useApp();
  const { t } = useI18n();
  const isMobile = useIsMobile();
  const [form] = Form.useForm<ContactFormValues>();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const {
    contacts,
    filteredContacts,
    isLoading,
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

  const selectedContact = selectedContactId
    ? contacts.find((contact) => contact.id === selectedContactId) ?? null
    : null;
  const activeFilterCount = [
    Boolean(searchText.trim()),
    typeFilter !== 'ALL',
    statusFilter !== 'active',
    membershipFilter !== 'all',
  ].filter(Boolean).length;
  const contactTypeLabelMap = useMemo(() => new Map(
    contactTypeOptions.map((option) => [option.value, t(option.labelKey)]),
  ), [t]);

  const resetFilters = () => {
    setSearchText('');
    setTypeFilter('ALL');
    setStatusFilter('active');
    setMembershipFilter('all');
  };

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

  const renderFilterControls = (mobile = false) => (
    <div className={mobile ? 'space-y-3' : 'grid grid-cols-1 gap-3 md:grid-cols-[minmax(240px,1fr)_220px_180px_180px]'}>
      <Input.Search
        allowClear
        size={mobile ? 'large' : 'middle'}
        value={searchText}
        aria-label={t('contacts.searchPlaceholder')}
        placeholder={t('contacts.searchPlaceholder')}
        onChange={(event) => setSearchText(event.target.value)}
      />
      <Select<ContactTypeFilter>
        size={mobile ? 'large' : 'middle'}
        value={typeFilter}
        onChange={setTypeFilter}
        options={[
          { value: 'ALL', label: t('contacts.filter.allTypes') },
          ...contactTypeOptions.map((option) => ({ value: option.value, label: t(option.labelKey) })),
        ]}
      />
      <Select<ContactStatusFilter>
        size={mobile ? 'large' : 'middle'}
        value={statusFilter}
        onChange={setStatusFilter}
        options={[
          { value: 'active', label: t('contacts.filter.active') },
          { value: 'inactive', label: t('contacts.filter.inactive') },
          { value: 'all', label: t('contacts.filter.allStatuses') },
        ]}
      />
      <Select<ContactMembershipFilter>
        size={mobile ? 'large' : 'middle'}
        value={membershipFilter}
        onChange={setMembershipFilter}
        options={[
          { value: 'all', label: t('contacts.filter.membershipAll') },
          { value: 'members', label: t('contacts.filter.members') },
          { value: 'non_members', label: t('contacts.filter.nonMembers') },
        ]}
      />
    </div>
  );

  return (
    <>
      {isMobile ? (
        <MobileCrudPageHeader
          testId="mobile-contact-page-header"
          title={t('contacts.title')}
          icon={<Users aria-hidden className="h-5 w-5 shrink-0" />}
          breadcrumb={<GlobalBreadcrumb pathname="/master-data/contacts" compact />}
        />
      ) : null}

      <Card
        className={isMobile ? '' : 'shadow-md'}
        style={isMobile ? { background: 'transparent', border: 0, boxShadow: 'none' } : undefined}
        styles={isMobile ? { body: { padding: 0 } } : undefined}
        title={!isMobile ? (
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            {t('contacts.title')}
          </div>
        ) : undefined}
        extra={!isMobile ? (
          <Button type="primary" icon={<Plus size={16} />} onClick={openAddModal}>
            {t('contacts.add')}
          </Button>
        ) : undefined}
      >
        <ResponsiveCrudCollection<Contact>
          desktop={(
            <>
              <div className="mb-4">{renderFilterControls()}</div>
              <ContactTable
                contacts={filteredContacts}
                loading={isLoading}
                onEdit={openEditModal}
                onArchive={handleArchive}
                onRestore={handleRestore}
              />
            </>
          )}
          mobileFilter={{
            open: isFilterOpen,
            title: t('contacts.filter.title'),
            onClose: () => setIsFilterOpen(false),
            onReset: resetFilters,
            resetDisabled: activeFilterCount === 0,
            resetLabel: t('contacts.filter.reset'),
            applyLabel: t('contacts.filter.apply'),
            children: (
              <div className="rounded-xl border border-gray-100 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
                  <SlidersHorizontal aria-hidden size={18} />
                  <span>{t('contacts.filter.title')}</span>
                </div>
                {renderFilterControls(true)}
              </div>
            ),
          }}
          mobileDetail={{
            open: selectedContact !== null,
            onClose: () => setSelectedContactId(null),
            closable: false,
            testId: 'contact-detail-sheet',
            bodyStyle: { padding: '20px 20px 24px' },
            children: selectedContact ? (
              <div className="space-y-4">
                <div className="mx-auto h-1 w-9 rounded-full bg-gray-200 dark:bg-gray-700" />
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                    <Users aria-hidden size={22} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-base font-extrabold">{selectedContact.name}</div>
                    <div className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">
                      {selectedContact.company_name || t('contacts.mobile.noCompany')}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  <Tag className="m-0" color={contactTypeOptions.find((option) => option.value === selectedContact.contact_type)?.color}>
                    {contactTypeLabelMap.get(selectedContact.contact_type)}
                  </Tag>
                  <Tag className="m-0" color={selectedContact.is_active ? 'green' : 'default'}>
                    {selectedContact.is_active ? t('contacts.status.active') : t('contacts.status.inactive')}
                  </Tag>
                  {selectedContact.is_member ? (
                    <Tag className="m-0" color={selectedContact.membership_status === 'INACTIVE' ? 'default' : 'blue'}>
                      {selectedContact.membership_number || t('contacts.mobile.member')}
                    </Tag>
                  ) : null}
                </div>

                <div className="space-y-2 rounded-xl bg-gray-50 p-3 text-sm dark:bg-gray-800">
                  {selectedContact.phone ? <div className="flex items-start gap-2"><Phone aria-hidden size={17} className="mt-0.5 shrink-0 text-gray-400" /><span>{selectedContact.phone}</span></div> : null}
                  {selectedContact.email ? <div className="flex items-start gap-2"><Mail aria-hidden size={17} className="mt-0.5 shrink-0 text-gray-400" /><span className="min-w-0 break-all">{selectedContact.email}</span></div> : null}
                  {selectedContact.address ? <div className="flex items-start gap-2"><MapPin aria-hidden size={17} className="mt-0.5 shrink-0 text-gray-400" /><span>{selectedContact.address}</span></div> : null}
                  {selectedContact.tax_number ? <div className="flex items-start gap-2"><Building2 aria-hidden size={17} className="mt-0.5 shrink-0 text-gray-400" /><span>{selectedContact.tax_number}</span></div> : null}
                  {!selectedContact.phone && !selectedContact.email && !selectedContact.address && !selectedContact.tax_number ? (
                    <span className="text-gray-500">{t('contacts.mobile.noContactInfo')}</span>
                  ) : null}
                </div>

                {selectedContact.is_member ? (
                  <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-3 text-sm dark:border-blue-900 dark:bg-blue-950/30">
                    <span className="font-semibold">{t('contacts.mobile.member')}</span>
                    <span className="ml-2 text-blue-700 dark:text-blue-300">
                      {t('contacts.mobile.points', { points: formatCurrency(selectedContact.membership_points_balance ?? 0) })}
                    </span>
                  </div>
                ) : null}

                <div className="grid grid-cols-2 gap-2">
                  <Button
                    size="large"
                    className="h-12"
                    danger={selectedContact.is_active}
                    onClick={() => {
                      const contact = selectedContact;
                      setSelectedContactId(null);
                      if (contact.is_active) handleArchive(contact);
                      else void handleRestore(contact);
                    }}
                  >
                    {selectedContact.is_active ? t('contacts.archive') : t('contacts.restore')}
                  </Button>
                  <Button
                    type="primary"
                    size="large"
                    className="h-12"
                    onClick={() => {
                      const contact = selectedContact;
                      setSelectedContactId(null);
                      openEditModal(contact);
                    }}
                  >
                    {t('contacts.edit')}
                  </Button>
                </div>
              </div>
            ) : null,
          }}
          mobileList={{
            items: filteredContacts,
            getKey: (contact) => contact.id,
            loading: isLoading,
            resetKey: JSON.stringify([searchText, typeFilter, statusFilter, membershipFilter]),
            resultSummary: t('contacts.filter.summary', { shown: filteredContacts.length, total: contacts.length }),
            emptyText: activeFilterCount > 0 ? t('contacts.filter.noResults') : t('contacts.empty'),
            emptyAction: activeFilterCount === 0 ? (
              <Button type="primary" size="large" icon={<Plus size={18} />} onClick={openAddModal}>
                {t('contacts.add')}
              </Button>
            ) : undefined,
            loadMoreLabel: (remaining) => t('contacts.mobile.loadMore', { count: remaining }),
            getItemAriaLabel: (contact) => t('contacts.mobile.detailAria', { name: contact.name }),
            getActionsAriaLabel: (contact) => t('contacts.mobile.actionsAria', { name: contact.name }),
            getActionSheetTitle: (contact) => contact.name,
            onItemClick: (contact) => setSelectedContactId(contact.id),
            getActions: (contact): MobileCrudAction<Contact>[] => [
              {
                key: 'edit',
                label: t('contacts.edit'),
                description: t('contacts.mobile.editDescription'),
                icon: <Edit2 aria-hidden size={19} />,
                onSelect: openEditModal,
              },
              contact.is_active ? {
                key: 'archive',
                label: t('contacts.archive'),
                description: t('contacts.mobile.archiveDescription'),
                icon: <Archive aria-hidden size={19} />,
                danger: true,
                onSelect: handleArchive,
              } : {
                key: 'restore',
                label: t('contacts.restore'),
                description: t('contacts.mobile.restoreDescription'),
                icon: <RotateCcw aria-hidden size={19} />,
                onSelect: handleRestore,
              },
            ],
            renderItem: (contact) => (
              <div className="space-y-3">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                    <Users aria-hidden size={20} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-bold">{contact.name}</span>
                    <span className="mt-0.5 block truncate text-xs text-gray-500 dark:text-gray-400">
                      {contact.company_name || t('contacts.mobile.noCompany')}
                    </span>
                  </span>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  <Tag className="m-0" color={contactTypeOptions.find((option) => option.value === contact.contact_type)?.color}>
                    {contactTypeLabelMap.get(contact.contact_type)}
                  </Tag>
                  <Tag className="m-0" color={contact.is_active ? 'green' : 'default'}>
                    {contact.is_active ? t('contacts.status.active') : t('contacts.status.inactive')}
                  </Tag>
                  {contact.is_member ? (
                    <Tag className="m-0" color={contact.membership_status === 'INACTIVE' ? 'default' : 'blue'}>
                      {t('contacts.mobile.member')}
                    </Tag>
                  ) : null}
                </div>

                <div className="grid grid-cols-1 gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                  {contact.phone ? <span className="flex min-w-0 items-center gap-2"><Phone aria-hidden size={15} className="shrink-0" /><span className="truncate">{contact.phone}</span></span> : null}
                  {contact.email ? <span className="flex min-w-0 items-center gap-2"><Mail aria-hidden size={15} className="shrink-0" /><span className="truncate">{contact.email}</span></span> : null}
                  {!contact.phone && !contact.email ? <span>{t('contacts.mobile.noContactInfo')}</span> : null}
                </div>
              </div>
            ),
          }}
          mobileFloatingActions={{
            actions: [
              {
                key: 'add',
                type: 'primary',
                icon: <Plus size={24} />,
                label: t('contacts.add'),
                testId: 'contact-add-fab',
                onClick: openAddModal,
              },
              {
                key: 'filter',
                icon: <SlidersHorizontal size={22} />,
                label: t('contacts.filter.title'),
                badge: { count: activeFilterCount, color: '#fa8c16' },
                testId: 'contact-filter-fab',
                onClick: () => setIsFilterOpen(true),
              },
            ],
          }}
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
    </>
  );
}
