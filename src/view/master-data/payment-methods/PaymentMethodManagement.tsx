import { useState } from 'react';
import { App, Button, Card, Form, Input, Select } from 'antd';
import { CreditCard, Plus } from 'lucide-react';
import { useI18n } from '@/hooks/useI18n';
import { usePaymentMethods, type PaymentMethodCategoryFilter, type PaymentMethodStatusFilter } from '@/hooks/usePaymentMethods';
import { PAYMENT_METHOD_CATEGORIES } from '@/lib/validations/paymentMethod';
import type { PaymentMethodMaster } from '@/types';
import PaymentMethodFormModal, { type PaymentMethodFormValues } from './PaymentMethodFormModal';
import PaymentMethodTable from './PaymentMethodTable';

export default function PaymentMethodManagement() {
  const { message, modal } = App.useApp();
  const { t } = useI18n();
  const [form] = Form.useForm<PaymentMethodFormValues>();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const {
    filteredPaymentMethods, postingAccounts, editingPaymentMethod,
    searchText, setSearchText, statusFilter, setStatusFilter, categoryFilter, setCategoryFilter,
    handleEdit, resetForm, submitForm, archivePaymentMethod, restorePaymentMethod, isSubmitting,
  } = usePaymentMethods();

  const closeModal = () => {
    setIsModalOpen(false);
    resetForm();
    form.resetFields();
  };
  const openAddModal = () => {
    resetForm();
    form.resetFields();
    form.setFieldsValue({ category: 'OTHER', requires_reference: false, is_active: true, sort_order: 0 });
    setIsModalOpen(true);
  };
  const openEditModal = (method: PaymentMethodMaster) => {
    handleEdit(method);
    form.setFieldsValue({
      code: method.code,
      name: method.name,
      category: method.category,
      posting_account_id: method.posting_account_id,
      requires_reference: method.requires_reference,
      is_active: method.is_active,
      sort_order: method.sort_order,
    });
    setIsModalOpen(true);
  };
  const handleSubmit = async (values: PaymentMethodFormValues) => {
    try {
      const wasEditing = Boolean(editingPaymentMethod);
      await submitForm(values);
      message.success(t(wasEditing ? 'paymentMethods.updateSuccess' : 'paymentMethods.createSuccess'));
      closeModal();
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('paymentMethods.saveFailed'));
    }
  };
  const handleArchive = (method: PaymentMethodMaster) => modal.confirm({
    title: t('paymentMethods.archiveConfirmTitle'),
    content: t('paymentMethods.archiveConfirmContent', { name: method.name }),
    okText: t('paymentMethods.archive'),
    okType: 'danger',
    cancelText: t('common.cancel'),
    onOk: async () => {
      try {
        await archivePaymentMethod(method.id);
        message.success(t('paymentMethods.archiveSuccess'));
      } catch (error) {
        message.error(error instanceof Error ? error.message : t('paymentMethods.archiveFailed'));
      }
    },
  });
  const handleRestore = async (method: PaymentMethodMaster) => {
    try {
      await restorePaymentMethod(method.id);
      message.success(t('paymentMethods.restoreSuccess'));
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('paymentMethods.restoreFailed'));
    }
  };

  return (
    <Card className="shadow-md" title={<div className="flex items-center gap-2"><CreditCard className="h-5 w-5" />{t('paymentMethods.title')}</div>} extra={<Button type="primary" icon={<Plus size={16} />} onClick={openAddModal}>{t('paymentMethods.add')}</Button>}>
      <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-[minmax(240px,1fr)_180px_180px]">
        <Input.Search allowClear value={searchText} placeholder={t('paymentMethods.searchPlaceholder')} onChange={(event) => setSearchText(event.target.value)} />
        <Select<PaymentMethodCategoryFilter> value={categoryFilter} onChange={setCategoryFilter} options={[
          { value: 'all', label: t('paymentMethods.filter.allCategories') },
          ...PAYMENT_METHOD_CATEGORIES.map((category) => ({ value: category, label: t(`paymentMethods.category.${category}`) })),
        ]} />
        <Select<PaymentMethodStatusFilter> value={statusFilter} onChange={setStatusFilter} options={[
          { value: 'active', label: t('paymentMethods.filter.active') },
          { value: 'inactive', label: t('paymentMethods.filter.inactive') },
          { value: 'all', label: t('paymentMethods.filter.allStatuses') },
        ]} />
      </div>
      <PaymentMethodTable paymentMethods={filteredPaymentMethods} onEdit={openEditModal} onArchive={handleArchive} onRestore={handleRestore} />
      <PaymentMethodFormModal form={form} open={isModalOpen} isEditing={Boolean(editingPaymentMethod)} isSystem={Boolean(editingPaymentMethod?.is_system)} isSubmitting={isSubmitting} postingAccounts={postingAccounts} onCancel={closeModal} onSubmit={handleSubmit} />
    </Card>
  );
}
