import { useState } from 'react';
import { App, Button, Card, Form, Input, Select } from 'antd';
import { Percent, Plus } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import dayjs from '@/lib/dayjs';
import { useTaxes, type TaxCalculationModeFilter, type TaxStatusFilter } from '@/hooks/useTaxes';
import { useI18n } from '@/hooks/useI18n';
import { db } from '@/lib/db';
import type { Tax } from '@/types';
import TaxFormModal, { type TaxFormValues } from './TaxFormModal';
import TaxTable from './TaxTable';
import { taxCalculationModeOptions } from './taxOptions';

export default function TaxManagement() {
  const { message, modal } = App.useApp();
  const { t } = useI18n();
  const [form] = Form.useForm<TaxFormValues>();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const {
    filteredTaxes,
    editingTax,
    searchText,
    setSearchText,
    statusFilter,
    setStatusFilter,
    calculationModeFilter,
    setCalculationModeFilter,
    handleEdit,
    resetForm,
    submitForm,
    archiveTax,
    restoreTax,
    setDefaultTax,
    isSubmitting,
  } = useTaxes();
  const accounts = useLiveQuery(
    () => db.chartOfAccounts.orderBy('code').toArray(),
    [],
    [],
  );

  const closeModal = () => {
    setIsModalOpen(false);
    resetForm();
    form.resetFields();
  };

  const openAddModal = () => {
    resetForm();
    form.resetFields();
    form.setFieldsValue({
      rate_type: 'PERCENTAGE',
      calculation_mode: 'EXCLUSIVE',
      tax_flow: 'ADDITIVE',
      is_default: false,
      is_active: true,
    });
    setIsModalOpen(true);
  };

  const openEditModal = (tax: Tax) => {
    handleEdit(tax);
    form.resetFields();
    form.setFieldsValue({
      name: tax.name,
      code: tax.code,
      rate: tax.rate,
      rate_type: tax.rate_type,
      calculation_mode: tax.calculation_mode,
      tax_flow: tax.tax_flow ?? 'ADDITIVE',
      sales_tax_account_id: tax.sales_tax_account_id,
      purchase_tax_account_id: tax.purchase_tax_account_id,
      effective_from: tax.effective_from ? dayjs(tax.effective_from) : null,
      effective_to: tax.effective_to ? dayjs(tax.effective_to) : null,
      description: tax.description,
      is_default: tax.is_default,
      is_active: tax.is_active,
    });
    setIsModalOpen(true);
  };

  const toTaxInput = (values: TaxFormValues) => ({
    name: values.name,
    code: values.code,
    rate: Number(values.rate),
    rate_type: 'PERCENTAGE' as const,
    calculation_mode: values.calculation_mode,
    tax_flow: values.tax_flow ?? 'ADDITIVE',
    sales_tax_account_id: values.tax_flow === 'WITHHOLDING' ? undefined : values.sales_tax_account_id,
    purchase_tax_account_id: values.purchase_tax_account_id,
    effective_from: values.effective_from?.toISOString(),
    effective_to: values.effective_to?.toISOString(),
    description: values.description,
    is_default: values.is_default,
    is_active: values.is_active,
  });

  const handleSubmit = async (values: TaxFormValues) => {
    try {
      const wasEditing = Boolean(editingTax);
      await submitForm(toTaxInput(values));
      message.success(wasEditing ? t('taxes.updateSuccess') : t('taxes.createSuccess'));
      closeModal();
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('taxes.saveFailed'));
    }
  };

  const handleArchive = (tax: Tax) => {
    modal.confirm({
      title: t('taxes.archiveConfirmTitle'),
      content: t('taxes.archiveConfirmContent', { name: tax.name }),
      okText: t('taxes.archive'),
      okType: 'danger',
      cancelText: t('common.cancel'),
      onOk: async () => {
        try {
          await archiveTax(tax.id);
          message.success(t('taxes.archiveSuccess'));
        } catch (error) {
          message.error(error instanceof Error ? error.message : t('taxes.archiveFailed'));
        }
      },
    });
  };

  const handleRestore = async (tax: Tax) => {
    try {
      await restoreTax(tax.id);
      message.success(t('taxes.restoreSuccess'));
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('taxes.restoreFailed'));
    }
  };

  const handleSetDefault = async (tax: Tax) => {
    try {
      await setDefaultTax(tax.id);
      message.success(t('taxes.setDefaultSuccess'));
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('taxes.setDefaultFailed'));
    }
  };

  return (
    <Card
      className="shadow-md"
      title={(
        <div className="flex items-center gap-2">
          <Percent className="h-5 w-5" />
          {t('taxes.title')}
        </div>
      )}
      extra={(
        <Button type="primary" icon={<Plus size={16} />} onClick={openAddModal}>
          {t('taxes.add')}
        </Button>
      )}
    >
      <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-[minmax(240px,1fr)_180px_180px]">
        <Input.Search
          allowClear
          value={searchText}
          placeholder={t('taxes.searchPlaceholder')}
          onChange={(event) => setSearchText(event.target.value)}
        />
        <Select<TaxStatusFilter>
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { value: 'active', label: t('taxes.filter.active') },
            { value: 'inactive', label: t('taxes.filter.inactive') },
            { value: 'all', label: t('taxes.filter.allStatuses') },
          ]}
        />
        <Select<TaxCalculationModeFilter>
          value={calculationModeFilter}
          onChange={setCalculationModeFilter}
          options={[
            { value: 'ALL', label: t('taxes.filter.allModes') },
            ...taxCalculationModeOptions.map((option) => ({ value: option.value, label: t(option.labelKey) })),
          ]}
        />
      </div>

      <TaxTable
        taxes={filteredTaxes}
        onEdit={openEditModal}
        onArchive={handleArchive}
        onRestore={handleRestore}
        onSetDefault={handleSetDefault}
      />
      <TaxFormModal
        form={form}
        open={isModalOpen}
        isEditing={Boolean(editingTax)}
        isSubmitting={isSubmitting}
        accounts={accounts}
        onCancel={closeModal}
        onSubmit={handleSubmit}
      />
    </Card>
  );
}
