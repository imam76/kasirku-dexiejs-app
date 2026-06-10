import { useCallback, useMemo, useState } from 'react';
import { Button, Card, DatePicker, Input, InputNumber, Segmented, Select, Tooltip } from 'antd';
import { Settings } from 'lucide-react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import type { DefaultValues } from 'react-hook-form';
import type { Dayjs } from 'dayjs';
import { useLiveQuery } from 'dexie-react-hooks';
import dayjs from '@/lib/dayjs';
import type { PurchaseDocumentConfig } from '@/configs/purchase-document';
import { useI18n } from '@/hooks/useI18n';
import type { TranslationKey } from '@/i18n/messages';
import { DocumentDiscountSettingsModal } from '@/components/DocumentDiscountSettingsModal';
import { DocumentCurrencyFields } from '@/components/DocumentCurrencyFields';
import { db } from '@/lib/db';
import { BASE_CURRENCY_CODE, DEFAULT_EXCHANGE_RATE } from '@/constants/currencies';
import type {
  Contact,
  CurrencyRate,
  Department,
  Product,
  ProductCategory,
  Project,
  PromoType,
  PurchaseDocument,
  PurchaseDocumentItem,
  Tax,
  Warehouse,
} from '@/types';
import { getDefaultDocumentDiscountAccount } from '@/utils/chartOfAccounts/getDocumentDiscountAccountSnapshot';
import { calculateDocumentTotal } from '@/utils/documentTotals';
import {
  applyCurrencySnapshotToLineItem,
  formatDocumentCurrencyAmount,
  isBaseCurrency,
  normalizeCurrencyCode,
  snapshotFromDocumentInput,
  toBaseCurrencyAmount,
  toDocumentCurrencyAmount,
  type DocumentCurrencySnapshot,
} from '@/utils/documentCurrency';
import { formatCurrency } from '@/utils/formatters';
import { PurchaseDocumentLineItems } from './PurchaseDocumentLineItems';

import { BasicProductFormModal } from '@/components/BasicProductFormModal';

interface PurchaseDocumentFormProps {
  config: PurchaseDocumentConfig;
  initialData?: {
    document?: PurchaseDocument;
    items?: PurchaseDocumentItem[];
  };
  contacts: Contact[];
  taxes: Tax[];
  departments: Department[];
  projects: Project[];
  warehouses: Warehouse[];
  products: Product[];
  onSubmit: (input: { document: Partial<PurchaseDocument>; items: PurchaseDocumentItem[] }) => Promise<void>;
  onCreateBasicProduct: (input: { name: string; sku?: string; category?: ProductCategory; unit: string; purchasePrice?: number }) => Product | undefined;
  onCancel?: () => void;
  submitting?: boolean;
}

export type PurchaseDocumentFormValues = Omit<
  Partial<PurchaseDocument>,
  'document_date' | 'required_date' | 'quotation_due_date' | 'due_date'
> & {
  document_date?: Dayjs;
  required_date?: Dayjs;
  quotation_due_date?: Dayjs;
  due_date?: Dayjs;
  items: PurchaseDocumentItem[];
};

const toFormInitialValues = (
  document: PurchaseDocument | undefined,
  config: PurchaseDocumentConfig,
): DefaultValues<PurchaseDocumentFormValues> => {
  if (!document) {
    const values: DefaultValues<PurchaseDocumentFormValues> = {
      document_date: dayjs(),
      discount_type: 'fixed',
      discount_value: 0,
      discount_amount: 0,
      currency_code: BASE_CURRENCY_CODE,
      currency_name: 'Rupiah Indonesia',
      currency_symbol: 'Rp',
      base_currency_code: BASE_CURRENCY_CODE,
      exchange_rate: DEFAULT_EXCHANGE_RATE,
      exchange_rate_source: 'SYSTEM',
      exchange_rate_basis: 'MID',
      exchange_rate_date: dayjs().format('YYYY-MM-DD'),
      items: [],
    };

    if (config.behavior.hasPaymentStatus) {
      values.payment_status = 'UNPAID';
      values.paid_amount = 0;
    }

    if (config.type === 'PURCHASE_RECEIPT') {
      values.cost_status = 'FINAL';
      values.additional_cost_treatment = 'IGNORE_FOR_MVP';
    }

    return values;
  }

  const values: DefaultValues<PurchaseDocumentFormValues> = {
    ...document,
    document_date: document.document_date ? dayjs(document.document_date) : undefined,
    required_date: document.required_date ? dayjs(document.required_date) : undefined,
    quotation_due_date: document.quotation_due_date ? dayjs(document.quotation_due_date) : undefined,
    due_date: document.due_date ? dayjs(document.due_date) : undefined,
    discount_type: document.discount_type ?? 'fixed',
    discount_value: document.discount_value ?? document.discount_amount ?? 0,
    discount_amount: document.discount_amount ?? 0,
  };

  if (!config.behavior.hasPaymentStatus) {
    delete values.payment_status;
    delete values.paid_amount;
    delete values.paid_at;
    delete values.finance_transaction_id;
  }

  return values;
};

const toIsoDate = (value: unknown) => {
  if (!value) return undefined;
  if (dayjs.isDayjs(value)) return value.format('YYYY-MM-DD');
  return String(value);
};

const omitLineItems = (values: PurchaseDocumentFormValues) => {
  const documentValues: Partial<PurchaseDocumentFormValues> = { ...values };
  delete documentValues.items;
  return documentValues;
};

const fieldContainerClassName = 'mb-4';
const labelClassName = 'mb-1.5 flex items-center gap-1 text-sm font-medium text-gray-700';

const warehouseHelperKeysByType = {
  PURCHASE_REQUEST: 'purchaseDocuments.helper.warehouse.purchaseRequest',
  REQUEST_FOR_QUOTATION: 'purchaseDocuments.helper.warehouse.requestForQuotation',
  PURCHASE_ORDER: 'purchaseDocuments.helper.warehouse.purchaseOrder',
  PURCHASE_RECEIPT: 'purchaseDocuments.helper.warehouse.purchaseReceipt',
  PURCHASE_INVOICE: 'purchaseDocuments.helper.warehouse.purchaseInvoice',
  PURCHASE_RETURN: 'purchaseDocuments.helper.warehouse.purchaseReturn',
} satisfies Record<PurchaseDocumentConfig['type'], TranslationKey>;

export const PurchaseDocumentForm = ({
  config,
  initialData,
  contacts,
  taxes,
  departments,
  projects,
  warehouses,
  products,
  onSubmit,
  onCreateBasicProduct,
  onCancel,
  submitting,
}: PurchaseDocumentFormProps) => {
  const { t } = useI18n();
  const documentId = initialData?.document?.id ?? 'draft';
  const warehouseHelperKey = warehouseHelperKeysByType[config.type];
  const [isDiscountSettingsOpen, setIsDiscountSettingsOpen] = useState(false);

  const [createProductOpen, setCreateProductOpen] = useState(false);
  const [newProductName, setNewProductName] = useState('');
  const [newProductSku, setNewProductSku] = useState('');
  const [activeLineId, setActiveLineId] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    setValue,
  } = useForm<PurchaseDocumentFormValues, unknown, PurchaseDocumentFormValues>({
    defaultValues: {
      ...toFormInitialValues(initialData?.document, config),
      items: initialData?.items ?? [],
    } as DefaultValues<PurchaseDocumentFormValues>,
  });
  const watchedItems = useWatch({ control, name: 'items' });
  const items = useMemo(() => watchedItems ?? [], [watchedItems]);
  const documentDate = useWatch({ control, name: 'document_date' });
  const watchedCostStatus = useWatch({ control, name: 'cost_status' });
  const watchedCurrencyCode = useWatch({ control, name: 'currency_code' });
  const watchedExchangeRate = useWatch({ control, name: 'exchange_rate' });
  const watchedExchangeRateSource = useWatch({ control, name: 'exchange_rate_source' });
  const watchedExchangeRateBasis = useWatch({ control, name: 'exchange_rate_basis' });
  const watchedExchangeRateDate = useWatch({ control, name: 'exchange_rate_date' });

  const handleCreateProductRequest = useCallback((lineId: string, search: string) => {
    const value = search.trim();
    const isBarcodeLike = /^\d{6,}$/.test(value);
    setNewProductName(isBarcodeLike ? '' : value);
    setNewProductSku(isBarcodeLike ? value : '');
    setActiveLineId(lineId);
    setCreateProductOpen(true);
  }, []);

  const handleCreateProductOk = useCallback((name: string, sku?: string, category?: ProductCategory) => {
    const activeItem = items.find((item) => item.id === activeLineId);
    const unit = activeItem?.unit || 'pcs';
    const purchasePrice = Number(activeItem?.price || 0);

    const product = onCreateBasicProduct({
      name,
      sku,
      category,
      unit,
      purchasePrice,
    });

    if (product && activeLineId) {
      const nextItems = items.map((item) => {
        if (item.id === activeLineId) {
          return {
            ...item,
            product_id: product.id,
            product_name: product.name,
            product_sku: product.sku,
            unit: product.purchase_unit || 'pcs',
            unit_price: product.purchase_price || 0,
          };
        }
        return item;
      });
      setValue('items', nextItems, { shouldDirty: true, shouldValidate: true });
    }

    setCreateProductOpen(false);
    setActiveLineId(null);
  }, [onCreateBasicProduct, activeLineId, items, setValue]);
  const discountType = useWatch({ control, name: 'discount_type' }) ?? 'fixed';
  const discountValue = useWatch({ control, name: 'discount_value' }) ?? 0;
  const selectedTaxId = useWatch({ control, name: 'tax_id' });
  const discountAccounts = useLiveQuery(
    () => db.chartOfAccounts
      .where('type')
      .equals('EXPENSE')
      .filter((account) => account.is_active && account.is_postable)
      .toArray(),
    [],
    [],
  );
  const currencies = useLiveQuery(
    () => db.currencies.orderBy('code').toArray(),
    [],
    [],
  );
  const currencyRates = useLiveQuery(
    () => db.currencyRates.orderBy('rate_date').reverse().toArray(),
    [],
    [],
  );
  const latestRateByCurrency = useMemo(() => (
    currencyRates.reduce<Record<string, CurrencyRate>>((acc, rate) => {
      if (!acc[rate.currency_code]) acc[rate.currency_code] = rate;
      return acc;
    }, {})
  ), [currencyRates]);
  const documentCurrencySnapshot = useMemo<DocumentCurrencySnapshot>(() => snapshotFromDocumentInput({
    currency_code: watchedCurrencyCode,
    exchange_rate: watchedExchangeRate,
    exchange_rate_source: watchedExchangeRateSource,
    exchange_rate_basis: watchedExchangeRateBasis,
    exchange_rate_date: watchedExchangeRateDate,
  }, currencies.find((currency) => currency.code === normalizeCurrencyCode(watchedCurrencyCode)), dayjs.isDayjs(documentDate) ? documentDate.format('YYYY-MM-DD') : undefined), [
    currencies,
    documentDate,
    watchedCurrencyCode,
    watchedExchangeRate,
    watchedExchangeRateBasis,
    watchedExchangeRateDate,
    watchedExchangeRateSource,
  ]);
  const discountAccountOptions = useMemo(() => discountAccounts.map((account) => ({
    value: account.id,
    label: `${account.code} - ${account.name}`,
  })), [discountAccounts]);
  const defaultDiscountAccount = useMemo(
    () => getDefaultDocumentDiscountAccount('purchase', discountAccounts),
    [discountAccounts],
  );
  const selectedTax = taxes.find((tax) => tax.id === selectedTaxId);
  const initialTaxSnapshot = selectedTaxId && selectedTaxId === initialData?.document?.tax_id
    ? initialData.document
    : undefined;
  const taxRate = selectedTax?.rate ?? initialTaxSnapshot?.tax_rate;
  const taxCalculationMode = selectedTax?.calculation_mode ?? initialTaxSnapshot?.tax_calculation_mode;
  const taxId = selectedTax?.id ?? initialTaxSnapshot?.tax_id;
  const taxName = selectedTax?.name ?? initialTaxSnapshot?.tax_name;
  const taxCode = selectedTax?.code ?? initialTaxSnapshot?.tax_code;
  const total = useMemo(
    () => calculateDocumentTotal({
      items,
      discountType,
      discountValue,
      taxRate,
      taxCalculationMode,
      taxId,
      taxName,
      taxCode,
      taxes,
      config,
    }),
    [config, discountType, discountValue, items, taxCalculationMode, taxCode, taxId, taxName, taxRate, taxes],
  );
  const isForeignCurrency = !isBaseCurrency(documentCurrencySnapshot.currency_code);
  const displayedDiscountValue = discountType === 'fixed'
    ? toDocumentCurrencyAmount(discountValue, documentCurrencySnapshot)
    : discountValue;
  const renderMoney = useCallback((amount?: number, className = 'font-medium text-gray-900') => (
    <span className="text-right">
      <span className={className}>
        {formatDocumentCurrencyAmount(
          toDocumentCurrencyAmount(amount, documentCurrencySnapshot),
          documentCurrencySnapshot,
        )}
      </span>
      {isForeignCurrency && (
        <span className="block text-[11px] font-normal text-gray-400">
          Rp {formatCurrency(amount || 0)}
        </span>
      )}
    </span>
  ), [documentCurrencySnapshot, isForeignCurrency]);

  const handleItemsChange = useCallback((nextItems: PurchaseDocumentItem[]) => {
    setValue('items', nextItems, { shouldDirty: true, shouldValidate: true });
  }, [setValue]);
  const handleCurrencySnapshotChange = useCallback((snapshot: DocumentCurrencySnapshot, previousCurrencyCode?: string) => {
    const previousCode = normalizeCurrencyCode(previousCurrencyCode);

    setValue('items', items.map((item) => {
      return applyCurrencySnapshotToLineItem({
        ...item,
        currency_code: snapshot.currency_code,
        exchange_rate: snapshot.exchange_rate,
        exchange_rate_source: snapshot.exchange_rate_source,
        exchange_rate_basis: snapshot.exchange_rate_basis,
        exchange_rate_date: snapshot.exchange_rate_date,
      }, snapshot, {
        preferForeignPrice: previousCode === snapshot.currency_code && item.foreign_price !== undefined,
      });
    }), { shouldDirty: true, shouldValidate: true });
  }, [items, setValue]);

  const handleTaxChange = useCallback((taxId?: string) => {
    const tax = taxes.find((candidate) => candidate.id === taxId);

    setValue('tax_name', tax?.name, { shouldDirty: true });
    setValue('tax_code', tax?.code, { shouldDirty: true });
    setValue('tax_rate', tax?.rate, { shouldDirty: true });
    setValue('tax_calculation_mode', tax?.calculation_mode, { shouldDirty: true });
  }, [setValue, taxes]);

  const handleFinish = async (values: PurchaseDocumentFormValues) => {
    const documentValues = omitLineItems(values);
    const completedItems = total.items.filter((item) => item.product_id);

    await onSubmit({
      document: {
        ...documentValues,
        type: config.type,
        document_date: toIsoDate(values.document_date),
        required_date: toIsoDate(values.required_date),
        quotation_due_date: toIsoDate(values.quotation_due_date),
        due_date: toIsoDate(values.due_date),
        discount_type: discountType,
        discount_value: Number(discountValue || 0),
        discount_amount: total.discount_amount,
      },
      items: completedItems,
    });
  };

  return (
    <form onSubmit={handleSubmit(handleFinish)} className="space-y-4">
      <div className="grid grid-cols-1 gap-x-4 md:grid-cols-2">
        <div className={fieldContainerClassName}>
          <label className={labelClassName}>{t('purchaseDocuments.field.supplier')}</label>
          <Controller
            name="contact_id"
            control={control}
            render={({ field }) => (
              <Select
                showSearch={{ optionFilterProp: 'label' }}
                allowClear
                className="w-full"
                value={field.value}
                placeholder={t('purchaseDocuments.placeholder.supplier')}
                options={contacts.map((contact) => ({
                  value: contact.id,
                  label: contact.company_name ? `${contact.name} - ${contact.company_name}` : contact.name,
                }))}
                onBlur={field.onBlur}
                onChange={(contactId) => {
                  field.onChange(contactId);
                  const contact = contacts.find((candidate) => candidate.id === contactId);
                  setValue('supplier_name', contact?.name, { shouldDirty: true, shouldValidate: true });
                  setValue('supplier_phone', contact?.phone, { shouldDirty: true });
                  setValue('supplier_email', contact?.email, { shouldDirty: true });
                  setValue('supplier_address', contact?.address, { shouldDirty: true });
                  setValue('supplier_company_name', contact?.company_name, { shouldDirty: true });
                  setValue('supplier_tax_number', contact?.tax_number, { shouldDirty: true });
                }}
              />
            )}
          />
          <p className="mt-1 text-xs leading-5 text-gray-500">{t(warehouseHelperKey)}</p>
        </div>
        <div className={fieldContainerClassName}>
          <label className={labelClassName}>{t('purchaseDocuments.field.supplierName')}</label>
          <Controller
            name="supplier_name"
            control={control}
            render={({ field }) => (
              <Input
                value={field.value ?? ''}
                onBlur={field.onBlur}
                onChange={field.onChange}
              />
            )}
          />
        </div>
        <div className={fieldContainerClassName}>
          <label className={labelClassName}>{t('purchaseDocuments.field.documentDate')}</label>
          <Controller
            name="document_date"
            control={control}
            render={({ field }) => (
              <DatePicker
                className="w-full"
                value={(field.value as Dayjs | undefined) ?? null}
                onBlur={field.onBlur}
                onChange={field.onChange}
              />
            )}
          />
        </div>
        {config.type === 'PURCHASE_REQUEST' && (
          <div className={fieldContainerClassName}>
            <label className={labelClassName}>{t('purchaseDocuments.field.requiredDate')}</label>
            <Controller
              name="required_date"
              control={control}
              render={({ field }) => (
                <DatePicker
                  className="w-full"
                  value={(field.value as Dayjs | undefined) ?? null}
                  onBlur={field.onBlur}
                  onChange={field.onChange}
                />
              )}
            />
          </div>
        )}
        {config.type === 'REQUEST_FOR_QUOTATION' && (
          <div className={fieldContainerClassName}>
            <label className={labelClassName}>{t('purchaseDocuments.field.quotationDueDate')}</label>
            <Controller
              name="quotation_due_date"
              control={control}
              render={({ field }) => (
                <DatePicker
                  className="w-full"
                  value={(field.value as Dayjs | undefined) ?? null}
                  onBlur={field.onBlur}
                  onChange={field.onChange}
                />
              )}
            />
          </div>
        )}
        {config.type === 'PURCHASE_RECEIPT' && (
          <>
            <div className={fieldContainerClassName}>
              <label className={labelClassName}>{t('purchaseDocuments.field.deliveryNoteNumber')}</label>
              <Controller
                name="delivery_note_number"
                control={control}
                render={({ field }) => (
                  <Input
                    value={field.value ?? ''}
                    onBlur={field.onBlur}
                    onChange={field.onChange}
                  />
                )}
              />
            </div>
            <div className={fieldContainerClassName}>
              <label className={labelClassName}>{t('purchaseDocuments.field.deliveryNoteDate')}</label>
              <Controller
                name="delivery_note_date"
                control={control}
                render={({ field }) => (
                  <DatePicker
                    className="w-full"
                    value={field.value ? dayjs(field.value as string) : null}
                    onBlur={field.onBlur}
                    onChange={(value) => field.onChange(value ? value.format('YYYY-MM-DD') : undefined)}
                  />
                )}
              />
            </div>
            <div className={fieldContainerClassName}>
              <label className={labelClassName}>{t('purchaseDocuments.field.costStatus')}</label>
              <Controller
                name="cost_status"
                control={control}
                render={({ field }) => (
                  <Select
                    className="w-full"
                    value={field.value ?? 'FINAL'}
                    options={[
                      { value: 'FINAL', label: t('purchaseDocuments.costStatus.final') },
                      { value: 'ESTIMATED', label: t('purchaseDocuments.costStatus.estimated') },
                      { value: 'PENDING', label: t('purchaseDocuments.costStatus.pending') },
                    ]}
                    onBlur={field.onBlur}
                    onChange={field.onChange}
                  />
                )}
              />
              {watchedCostStatus === 'ESTIMATED' && (
                <p className="mt-1 text-xs leading-5 text-amber-700">
                  {t('purchaseDocuments.helper.estimatedCost')}
                </p>
              )}
              {watchedCostStatus === 'PENDING' && (
                <p className="mt-1 text-xs leading-5 text-red-600">
                  {t('purchaseDocuments.helper.pendingCost')}
                </p>
              )}
            </div>
          </>
        )}
        {config.behavior.hasDueDate && (
          <div className={fieldContainerClassName}>
            <label className={labelClassName}>{t('purchaseDocuments.field.dueDate')}</label>
            <Controller
              name="due_date"
              control={control}
              render={({ field }) => (
                <DatePicker
                  className="w-full"
                  value={(field.value as Dayjs | undefined) ?? null}
                  onBlur={field.onBlur}
                  onChange={field.onChange}
                />
              )}
            />
          </div>
        )}
        <div className={fieldContainerClassName}>
          <label className={labelClassName}>{t('purchaseDocuments.field.department')}</label>
          <Controller
            name="department_id"
            control={control}
            render={({ field }) => (
              <Select
                allowClear
                showSearch={{ optionFilterProp: 'label' }}
                className="w-full"
                value={field.value}
                placeholder={t('purchaseDocuments.placeholder.department')}
                options={departments.map((department) => ({
                  value: department.id,
                  label: department.code ? `${department.code} - ${department.name}` : department.name,
                }))}
                onBlur={field.onBlur}
                onChange={field.onChange}
              />
            )}
          />
        </div>
        <div className={fieldContainerClassName}>
          <label className={labelClassName}>{t('purchaseDocuments.field.project')}</label>
          <Controller
            name="project_id"
            control={control}
            render={({ field }) => (
              <Select
                allowClear
                showSearch={{ optionFilterProp: 'label' }}
                className="w-full"
                value={field.value}
                placeholder={t('purchaseDocuments.placeholder.project')}
                options={projects.map((project) => ({
                  value: project.id,
                  label: project.code ? `${project.code} - ${project.name}` : project.name,
                }))}
                onBlur={field.onBlur}
                onChange={field.onChange}
              />
            )}
          />
        </div>
        <div className={fieldContainerClassName}>
          <label className={labelClassName}>{t('purchaseDocuments.field.warehouse')}</label>
          <Controller
            name="warehouse_id"
            control={control}
            render={({ field }) => (
              <Select
                allowClear
                showSearch={{ optionFilterProp: 'label' }}
                className="w-full"
                value={field.value}
                placeholder={t('purchaseDocuments.placeholder.warehouse')}
                options={warehouses.map((warehouse) => ({
                  value: warehouse.id,
                  label: warehouse.code ? `${warehouse.code} - ${warehouse.name}` : warehouse.name,
                }))}
                onBlur={field.onBlur}
                onChange={(warehouseId) => {
                  field.onChange(warehouseId);
                  const warehouse = warehouses.find((candidate) => candidate.id === warehouseId);
                  setValue('warehouse_name', warehouse?.name, { shouldDirty: true });
                  setValue('warehouse_code', warehouse?.code, { shouldDirty: true });
                }}
              />
            )}
          />
        </div>
        <div className={`${fieldContainerClassName} md:col-span-2`}>
          <label className={labelClassName}>{t('purchaseDocuments.field.notes')}</label>
          <Controller
            name="notes"
            control={control}
            render={({ field }) => (
              <Input.TextArea
                rows={3}
                value={field.value ?? ''}
                onBlur={field.onBlur}
                onChange={field.onChange}
              />
            )}
          />
        </div>
      </div>

      {config.behavior.hasPricing && (
        <DocumentCurrencyFields
          control={control}
          setValue={setValue}
          currencies={currencies}
          latestRateByCurrency={latestRateByCurrency}
          documentDate={documentDate}
          onSnapshotChange={handleCurrencySnapshotChange}
        />
      )}

      <PurchaseDocumentLineItems
        config={config}
        documentId={documentId}
        items={items}
        calculatedItems={total.items}
        products={products}
        taxes={taxes}
        documentCurrencySnapshot={documentCurrencySnapshot}
        onChange={handleItemsChange}
        onCreateProductRequest={handleCreateProductRequest}
      />

      {config.behavior.hasPricing && (
        <Card size="small" className="ml-auto w-full max-w-md">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-gray-500">{t('purchaseDocuments.field.subtotal')}</span>
              {renderMoney(total.subtotal_amount)}
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <span className="text-sm text-gray-500">{t('purchaseDocuments.field.documentDiscount')}</span>
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                <Segmented
                  size="small"
                  value={discountType}
                  options={[
                    { value: 'fixed', label: t('purchaseDocuments.discountType.fixed') },
                    { value: 'percent', label: t('purchaseDocuments.discountType.percent') },
                  ]}
                  onChange={(value) => setValue('discount_type', value as PromoType, { shouldDirty: true, shouldValidate: true })}
                />
                <InputNumber
                  min={0}
                  max={discountType === 'percent' ? 100 : undefined}
                  className="w-full sm:w-32"
                  value={Number(displayedDiscountValue || 0)}
                  addonAfter={discountType === 'percent' ? '%' : undefined}
                  onChange={(value) => setValue(
                    'discount_value',
                    discountType === 'fixed'
                      ? toBaseCurrencyAmount(Number(value || 0), documentCurrencySnapshot)
                      : Number(value || 0),
                    { shouldDirty: true, shouldValidate: true },
                  )}
                />
                <Tooltip title={t('purchaseDocuments.field.discountAccount')}>
                  <Button
                    type="default"
                    icon={<Settings size={16} />}
                    aria-label={t('purchaseDocuments.field.discountAccount')}
                    onClick={() => setIsDiscountSettingsOpen(true)}
                  />
                </Tooltip>
              </div>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-gray-500">{t('purchaseDocuments.field.discountAmount')}</span>
              {renderMoney(total.discount_amount)}
            </div>
            <Controller
              name="discount_account_id"
              control={control}
              render={({ field }) => (
                <DocumentDiscountSettingsModal
                  open={isDiscountSettingsOpen}
                  title={t('purchaseDocuments.field.documentDiscount')}
                  accountLabel={t('purchaseDocuments.field.discountAccount')}
                  accountPlaceholder={t('purchaseDocuments.placeholder.discountAccount')}
                  accountValue={field.value}
                  defaultAccountValue={defaultDiscountAccount?.id}
                  accountOptions={discountAccountOptions}
                  onAccountChange={field.onChange}
                  onClose={() => setIsDiscountSettingsOpen(false)}
                />
              )}
            />
            {config.behavior.hasTax && (
              <>
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                  <span className="text-sm text-gray-500">{t('purchaseDocuments.field.documentTax')}</span>
                  <Controller
                    name="tax_id"
                    control={control}
                    render={({ field }) => (
                      <Select
                        className="w-full sm:w-56"
                        allowClear
                        showSearch={{ optionFilterProp: 'label' }}
                        placeholder={t('purchaseDocuments.placeholder.tax')}
                        value={field.value}
                        onBlur={field.onBlur}
                        options={taxes.map((tax) => ({ value: tax.id, label: `${tax.name} (${tax.rate}%)` }))}
                        onChange={(taxId) => {
                          field.onChange(taxId);
                          handleTaxChange(taxId);
                        }}
                      />
                    )}
                  />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-gray-500">{t('purchaseDocuments.field.tax')}</span>
                  {renderMoney(total.tax_amount)}
                </div>
              </>
            )}
            <div className="flex items-center justify-between gap-4 border-t border-gray-100 pt-3">
              <span className="text-sm font-medium text-gray-700">{t('purchaseDocuments.field.total')}</span>
              {renderMoney(total.total_amount, 'text-lg font-semibold text-gray-900')}
            </div>
          </div>
        </Card>
      )}

      <div className="flex w-full justify-end gap-2">
        {onCancel && <Button onClick={onCancel}>{t('common.cancel')}</Button>}
        <Button type="primary" htmlType="submit" loading={submitting}>
          {t('purchaseDocuments.saveDraft')}
        </Button>
      </div>

      <BasicProductFormModal
        open={createProductOpen}
        onCancel={() => setCreateProductOpen(false)}
        onOk={handleCreateProductOk}
        initialName={newProductName}
        initialSku={newProductSku}
        unit={items.find((item) => item.id === activeLineId)?.unit || 'pcs'}
      />
    </form>
  );
};
