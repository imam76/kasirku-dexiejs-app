import { useState } from 'react';
import { App, Button, Card, Form, Input, Select } from 'antd';
import { Banknote, Plus } from 'lucide-react';
import { useCurrencies, type CurrencyStatusFilter } from '@/hooks/useCurrencies';
import { useI18n } from '@/hooks/useI18n';
import type { Currency } from '@/types';
import CurrencyFormModal, { type CurrencyFormValues } from './CurrencyFormModal';
import CurrencyRateModal, { type CurrencyRateFormValues } from './CurrencyRateModal';
import CurrencyTable from './CurrencyTable';

export default function CurrencyManagement() {
  const { message, modal } = App.useApp();
  const { t } = useI18n();
  const [form] = Form.useForm<CurrencyFormValues>();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [rateCurrency, setRateCurrency] = useState<Currency | null>(null);
  const {
    filteredCurrencies,
    latestRateByCurrency,
    editingCurrency,
    searchText,
    setSearchText,
    statusFilter,
    setStatusFilter,
    handleEdit,
    resetForm,
    submitForm,
    submitRate,
    fetchBiRate,
    archiveCurrency,
    restoreCurrency,
    isSubmitting,
    isSavingRate,
    isFetchingBiRate,
  } = useCurrencies();

  const closeModal = () => {
    setIsModalOpen(false);
    resetForm();
    form.resetFields();
  };

  const openAddModal = () => {
    resetForm();
    form.resetFields();
    form.setFieldsValue({ decimal_places: 2, is_active: true });
    setIsModalOpen(true);
  };

  const openEditModal = (currency: Currency) => {
    handleEdit(currency);
    form.resetFields();
    form.setFieldsValue({
      code: currency.code,
      name: currency.name,
      symbol: currency.symbol,
      decimal_places: currency.decimal_places,
      is_active: currency.is_active,
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (values: CurrencyFormValues) => {
    try {
      const wasEditing = Boolean(editingCurrency);
      await submitForm(values);
      message.success(wasEditing ? t('currencies.updateSuccess') : t('currencies.createSuccess'));
      closeModal();
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('currencies.saveFailed'));
    }
  };

  const handleArchive = (currency: Currency) => {
    modal.confirm({
      title: t('currencies.archiveConfirmTitle'),
      content: t('currencies.archiveConfirmContent', { code: currency.code }),
      okText: t('currencies.archive'),
      okType: 'danger',
      cancelText: t('common.cancel'),
      onOk: async () => {
        try {
          await archiveCurrency(currency.id);
          message.success(t('currencies.archiveSuccess'));
        } catch (error) {
          message.error(error instanceof Error ? error.message : t('currencies.archiveFailed'));
        }
      },
    });
  };

  const handleRestore = async (currency: Currency) => {
    try {
      await restoreCurrency(currency.id);
      message.success(t('currencies.restoreSuccess'));
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('currencies.restoreFailed'));
    }
  };

  const handleManualRateSubmit = async (
    values: Required<Pick<CurrencyRateFormValues, 'rate_date' | 'unit_amount' | 'middle_rate'>> & CurrencyRateFormValues,
  ) => {
    if (!rateCurrency) return;

    await submitRate({
      currency_code: rateCurrency.code,
      rate_date: values.rate_date.format('YYYY-MM-DD'),
      unit_amount: values.unit_amount,
      middle_rate: values.middle_rate,
      source: 'MANUAL',
    });
    message.success(t('currencies.rateSaveSuccess'));
  };

  const handleFetchBiRate = async (currencyCode: string, targetDate: string) => {
    await fetchBiRate(currencyCode, targetDate);
    message.success(t('currencies.biFetchSuccess'));
  };

  return (
    <Card
      className="shadow-md"
      title={(
        <div className="flex items-center gap-2">
          <Banknote className="h-5 w-5" />
          {t('currencies.title')}
        </div>
      )}
      extra={(
        <Button type="primary" icon={<Plus size={16} />} onClick={openAddModal}>
          {t('currencies.add')}
        </Button>
      )}
    >
      <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-[minmax(240px,1fr)_180px]">
        <Input.Search
          allowClear
          value={searchText}
          placeholder={t('currencies.searchPlaceholder')}
          onChange={(event) => setSearchText(event.target.value)}
        />
        <Select<CurrencyStatusFilter>
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { value: 'active', label: t('currencies.filter.active') },
            { value: 'inactive', label: t('currencies.filter.inactive') },
            { value: 'all', label: t('currencies.filter.allStatuses') },
          ]}
        />
      </div>

      <CurrencyTable
        currencies={filteredCurrencies}
        latestRateByCurrency={latestRateByCurrency}
        onEdit={openEditModal}
        onOpenRate={setRateCurrency}
        onArchive={handleArchive}
        onRestore={handleRestore}
      />
      <CurrencyFormModal
        form={form}
        open={isModalOpen}
        isEditing={Boolean(editingCurrency)}
        isBaseCurrency={Boolean(editingCurrency?.is_base)}
        isSubmitting={isSubmitting}
        onCancel={closeModal}
        onSubmit={handleSubmit}
      />
      <CurrencyRateModal
        key={rateCurrency?.id ?? 'rate'}
        open={Boolean(rateCurrency)}
        currency={rateCurrency}
        latestRate={rateCurrency ? latestRateByCurrency[rateCurrency.code] : undefined}
        isSavingRate={isSavingRate}
        isFetchingBiRate={isFetchingBiRate}
        onCancel={() => setRateCurrency(null)}
        onManualSubmit={handleManualRateSubmit}
        onFetchBiRate={handleFetchBiRate}
      />
    </Card>
  );
}
