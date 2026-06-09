import { useState } from 'react';
import { App, Button, Card, Form, Input, Select } from 'antd';
import { MapPinned, Plus } from 'lucide-react';
import { useCooperativeAreas, type CooperativeAreaStatusFilter } from '@/hooks/useCooperativeAreas';
import { useI18n } from '@/hooks/useI18n';
import type { CooperativeArea } from '@/types';
import AreaFormModal, { type AreaFormValues } from './AreaFormModal';
import AreaTable from './AreaTable';

export default function AreaManagement() {
  const { message, modal } = App.useApp();
  const { t } = useI18n();
  const [form] = Form.useForm<AreaFormValues>();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const {
    filteredAreas,
    editingArea,
    searchText,
    setSearchText,
    statusFilter,
    setStatusFilter,
    handleEdit,
    resetForm,
    submitForm,
    archiveArea,
    restoreArea,
    isSubmitting,
  } = useCooperativeAreas();

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

  const openEditModal = (area: CooperativeArea) => {
    handleEdit(area);
    form.resetFields();
    form.setFieldsValue({
      name: area.name,
      code: area.code,
      description: area.description,
      is_active: area.is_active,
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (values: AreaFormValues) => {
    try {
      const wasEditing = Boolean(editingArea);
      await submitForm(values);
      message.success(wasEditing ? t('areas.updateSuccess') : t('areas.createSuccess'));
      closeModal();
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('areas.saveFailed'));
    }
  };

  const handleArchive = (area: CooperativeArea) => {
    modal.confirm({
      title: t('areas.archiveConfirmTitle'),
      content: t('areas.archiveConfirmContent', { name: area.name }),
      okText: t('areas.archive'),
      okType: 'danger',
      cancelText: t('common.cancel'),
      onOk: async () => {
        try {
          await archiveArea(area.id);
          message.success(t('areas.archiveSuccess'));
        } catch (error) {
          message.error(error instanceof Error ? error.message : t('areas.archiveFailed'));
        }
      },
    });
  };

  const handleRestore = async (area: CooperativeArea) => {
    try {
      await restoreArea(area.id);
      message.success(t('areas.restoreSuccess'));
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('areas.restoreFailed'));
    }
  };

  return (
    <Card
      className="shadow-md"
      title={(
        <div className="flex items-center gap-2">
          <MapPinned className="h-5 w-5" />
          {t('areas.title')}
        </div>
      )}
      extra={(
        <Button type="primary" icon={<Plus size={16} />} onClick={openAddModal}>
          {t('areas.add')}
        </Button>
      )}
    >
      <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-[minmax(240px,1fr)_180px]">
        <Input.Search
          allowClear
          value={searchText}
          placeholder={t('areas.searchPlaceholder')}
          onChange={(event) => setSearchText(event.target.value)}
        />
        <Select<CooperativeAreaStatusFilter>
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { value: 'active', label: t('areas.filter.active') },
            { value: 'inactive', label: t('areas.filter.inactive') },
            { value: 'all', label: t('areas.filter.allStatuses') },
          ]}
        />
      </div>

      <AreaTable
        areas={filteredAreas}
        onEdit={openEditModal}
        onArchive={handleArchive}
        onRestore={handleRestore}
      />
      <AreaFormModal
        form={form}
        open={isModalOpen}
        isEditing={Boolean(editingArea)}
        isSubmitting={isSubmitting}
        onCancel={closeModal}
        onSubmit={handleSubmit}
      />
    </Card>
  );
}
