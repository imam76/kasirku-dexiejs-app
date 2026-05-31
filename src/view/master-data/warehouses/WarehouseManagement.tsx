import { useState } from 'react';
import { App, Button, Card, Form, Input, Select } from 'antd';
import { Plus, Warehouse as WarehouseIcon } from 'lucide-react';
import { useWarehouses, type WarehouseStatusFilter } from '@/hooks/useWarehouses';
import { useI18n } from '@/hooks/useI18n';
import type { Warehouse } from '@/types';
import WarehouseFormModal, { type WarehouseFormValues } from './WarehouseFormModal';
import WarehouseTable from './WarehouseTable';

export default function WarehouseManagement() {
  const { message, modal } = App.useApp();
  const { t } = useI18n();
  const [form] = Form.useForm<WarehouseFormValues>();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const {
    filteredWarehouses,
    editingWarehouse,
    searchText,
    setSearchText,
    statusFilter,
    setStatusFilter,
    handleEdit,
    resetForm,
    submitForm,
    archiveWarehouse,
    restoreWarehouse,
    isSubmitting,
  } = useWarehouses();

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

  const openEditModal = (warehouse: Warehouse) => {
    handleEdit(warehouse);
    form.resetFields();
    form.setFieldsValue({
      name: warehouse.name,
      code: warehouse.code,
      address: warehouse.address,
      phone: warehouse.phone,
      notes: warehouse.notes,
      is_active: warehouse.is_active,
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (values: WarehouseFormValues) => {
    try {
      const wasEditing = Boolean(editingWarehouse);
      await submitForm(values);
      message.success(wasEditing ? t('warehouses.updateSuccess') : t('warehouses.createSuccess'));
      closeModal();
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('warehouses.saveFailed'));
    }
  };

  const handleArchive = (warehouse: Warehouse) => {
    modal.confirm({
      title: t('warehouses.archiveConfirmTitle'),
      content: t('warehouses.archiveConfirmContent', { name: warehouse.name }),
      okText: t('warehouses.archive'),
      okType: 'danger',
      cancelText: t('common.cancel'),
      onOk: async () => {
        try {
          await archiveWarehouse(warehouse.id);
          message.success(t('warehouses.archiveSuccess'));
        } catch (error) {
          message.error(error instanceof Error ? error.message : t('warehouses.archiveFailed'));
        }
      },
    });
  };

  const handleRestore = async (warehouse: Warehouse) => {
    try {
      await restoreWarehouse(warehouse.id);
      message.success(t('warehouses.restoreSuccess'));
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('warehouses.restoreFailed'));
    }
  };

  return (
    <Card
      className="shadow-md"
      title={(
        <div className="flex items-center gap-2">
          <WarehouseIcon className="h-5 w-5" />
          {t('warehouses.title')}
        </div>
      )}
      extra={(
        <Button type="primary" icon={<Plus size={16} />} onClick={openAddModal}>
          {t('warehouses.add')}
        </Button>
      )}
    >
      <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-[minmax(240px,1fr)_180px]">
        <Input.Search
          allowClear
          value={searchText}
          placeholder={t('warehouses.searchPlaceholder')}
          onChange={(event) => setSearchText(event.target.value)}
        />
        <Select<WarehouseStatusFilter>
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { value: 'active', label: t('warehouses.filter.active') },
            { value: 'inactive', label: t('warehouses.filter.inactive') },
            { value: 'all', label: t('warehouses.filter.allStatuses') },
          ]}
        />
      </div>

      <WarehouseTable
        warehouses={filteredWarehouses}
        onEdit={openEditModal}
        onArchive={handleArchive}
        onRestore={handleRestore}
      />
      <WarehouseFormModal
        form={form}
        open={isModalOpen}
        isEditing={Boolean(editingWarehouse)}
        isSubmitting={isSubmitting}
        onCancel={closeModal}
        onSubmit={handleSubmit}
      />
    </Card>
  );
}
