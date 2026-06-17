import { useState } from 'react';
import { App, Button, Card, Form, Input, Select } from 'antd';
import { Plus, Users } from 'lucide-react';
import dayjs from '@/lib/dayjs';
import {
  useCooperativeMembers,
  type CooperativeMemberAreaFilter,
  type CooperativeMemberStatusFilter,
} from '@/hooks/useCooperativeMembers';
import { useI18n } from '@/hooks/useI18n';
import type { CooperativeMember } from '@/types';
import CooperativeMemberDetailDrawer from './CooperativeMemberDetailDrawer';
import CooperativeMemberFormModal, { type CooperativeMemberFormValues } from './CooperativeMemberFormModal';
import CooperativeMemberTable from './CooperativeMemberTable';
import { cooperativeMemberStatusOptions } from './memberOptions';

export default function CooperativeMemberManagement() {
  const { message, modal } = App.useApp();
  const { t } = useI18n();
  const [form] = Form.useForm<CooperativeMemberFormValues>();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const {
    filteredMembers,
    areas,
    employees,
    employeeAreaAssignments,
    visibleAreas,
    editingMember,
    selectedMember,
    searchText,
    setSearchText,
    statusFilter,
    setStatusFilter,
    areaFilter,
    setAreaFilter,
    handleEdit,
    handleSelect,
    resetForm,
    submitForm,
    archiveMember,
    restoreMember,
    isSubmitting,
  } = useCooperativeMembers();

  const closeModal = () => {
    setIsModalOpen(false);
    resetForm();
    form.resetFields();
  };

  const openAddModal = () => {
    resetForm();
    form.resetFields();
    form.setFieldsValue({ status: 'ACTIVE', join_date: dayjs() });
    setIsModalOpen(true);
  };

  const openEditModal = (member: CooperativeMember) => {
    handleEdit(member);
    form.resetFields();
    form.setFieldsValue({
      member_number: member.member_number,
      name: member.name,
      identity_number: member.identity_number,
      phone: member.phone,
      address: member.address,
      area_id: member.area_id,
      officer_id: member.officer_id,
      join_date: member.join_date ? dayjs(member.join_date) : null,
      status: member.status,
      notes: member.notes,
    });
    setIsModalOpen(true);
  };

  const toMemberInput = (values: CooperativeMemberFormValues) => ({
    member_number: values.member_number,
    name: values.name,
    identity_number: values.identity_number,
    phone: values.phone,
    address: values.address,
    area_id: values.area_id,
    officer_id: values.officer_id,
    join_date: values.join_date?.toISOString() ?? '',
    status: values.status,
    notes: values.notes,
  });

  const handleSubmit = async (values: CooperativeMemberFormValues) => {
    try {
      const wasEditing = Boolean(editingMember);
      await submitForm(toMemberInput(values));
      message.success(wasEditing ? t('cooperative.members.updateSuccess') : t('cooperative.members.createSuccess'));
      closeModal();
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('cooperative.members.saveFailed'));
    }
  };

  const handleArchive = (member: CooperativeMember) => {
    modal.confirm({
      title: t('cooperative.members.archiveConfirmTitle'),
      content: t('cooperative.members.archiveConfirmContent', { name: member.name }),
      okText: t('cooperative.members.archive'),
      okType: 'danger',
      cancelText: t('common.cancel'),
      onOk: async () => {
        try {
          await archiveMember(member.id);
          message.success(t('cooperative.members.archiveSuccess'));
        } catch (error) {
          message.error(error instanceof Error ? error.message : t('cooperative.members.archiveFailed'));
        }
      },
    });
  };

  const handleRestore = async (member: CooperativeMember) => {
    try {
      await restoreMember(member.id);
      message.success(t('cooperative.members.restoreSuccess'));
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('cooperative.members.restoreFailed'));
    }
  };

  return (
    <Card
      className="shadow-md"
      title={(
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          {t('cooperative.members.title')}
        </div>
      )}
      extra={(
        <Button
          type="primary"
          icon={<Plus size={16} />}
          data-testid="koperasi-member-add-button"
          onClick={openAddModal}
        >
          {t('cooperative.members.add')}
        </Button>
      )}
    >
      <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-[minmax(240px,1fr)_minmax(180px,220px)_190px]">
        <Input.Search
          allowClear
          value={searchText}
          placeholder={t('cooperative.members.searchPlaceholder')}
          onChange={(event) => setSearchText(event.target.value)}
        />
        <Select<CooperativeMemberAreaFilter>
          showSearch
          value={areaFilter}
          onChange={setAreaFilter}
          optionFilterProp="label"
          options={[
            { value: 'ALL', label: t('cooperative.members.filter.allAreas') },
            { value: 'UNASSIGNED', label: t('cooperative.members.filter.unassignedArea') },
            ...visibleAreas.map((area) => ({
              value: area.id,
              label: area.code ? `${area.code} - ${area.name}` : area.name,
            })),
          ]}
        />
        <Select<CooperativeMemberStatusFilter>
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { value: 'ALL', label: t('cooperative.members.filter.allStatuses') },
            ...cooperativeMemberStatusOptions.map((option) => ({ value: option.value, label: t(option.labelKey) })),
          ]}
        />
      </div>

      <CooperativeMemberTable
        members={filteredMembers}
        onView={handleSelect}
        onEdit={openEditModal}
        onArchive={handleArchive}
        onRestore={handleRestore}
      />
      <CooperativeMemberFormModal
        form={form}
        open={isModalOpen}
        areas={areas}
        employees={employees}
        employeeAreaAssignments={employeeAreaAssignments}
        isEditing={Boolean(editingMember)}
        isSubmitting={isSubmitting}
        onCancel={closeModal}
        onSubmit={handleSubmit}
      />
      <CooperativeMemberDetailDrawer
        member={selectedMember}
        open={Boolean(selectedMember)}
        onClose={() => handleSelect(null)}
      />
    </Card>
  );
}
