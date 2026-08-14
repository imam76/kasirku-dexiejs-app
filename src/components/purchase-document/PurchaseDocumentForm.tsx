import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { App, Button, DatePicker, Input, Select } from 'antd';
import { Controller, useForm, useWatch } from 'react-hook-form';
import type { DefaultValues } from 'react-hook-form';
import type { Dayjs } from 'dayjs';
import { useLiveQuery } from 'dexie-react-hooks';
import dayjs from '@/lib/dayjs';
import type { PurchaseDocumentConfig } from '@/configs/purchase-document';
import { useI18n } from '@/hooks/useI18n';
import { useBaseCurrency } from '@/hooks/useBaseCurrency';
import { buildQuickCreateDefaultValues, useProductQuickCreateForm } from '@/hooks/useProductQuickCreateForm';
import { useProductQuickEditForm } from '@/hooks/useProductQuickEditForm';
import type { TranslationKey } from '@/i18n/messages';
import { DocumentCurrencyFields } from '@/components/DocumentCurrencyFields';
import { DocumentTotalsSummary } from '@/components/document-line-items/DocumentTotalsSummary';
import { db } from '@/lib/db';
import type { StockFormData } from '@/lib/validations/stock';
import { createProductRecord } from '@/services/productCreateService';
import { updateProductRecord } from '@/services/productUpdateService';
import { getCachedBaseCurrency } from '@/services/baseCurrencyService';
import type {
  Contact,
  CurrencyRate,
  Department,
  Product,
  Project,
  PurchaseDocument,
  PurchaseDocumentItem,
  Tax,
  Warehouse,
} from '@/types';
import { calculateDocumentTotal } from '@/utils/documentTotals';
import { createEmptyPurchaseDocumentItem } from '@/utils/purchaseDocuments/createEmptyPurchaseDocumentItem';
import { countFilledLineItems } from '@/utils/documentLineItems/lineItemView';
import {
  applyCurrencySnapshotToLineItem,
  buildDocumentCurrencySnapshot,
  normalizeCurrencyCode,
  snapshotFromDocumentInput,
  type DocumentCurrencySnapshot,
} from '@/utils/documentCurrency';
import { PurchaseDocumentLineItems } from './PurchaseDocumentLineItems';

import { getPurchasePrice } from '@/utils/pricing';
import StockProductModal from '@/view/master-data/products/StockProductModal';

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

const MIN_DEFAULT_ITEM_ROWS = 5;

const createDefaultLineItems = (
  documentId: string,
  currencySnapshot: DocumentCurrencySnapshot,
): PurchaseDocumentItem[] => (
  Array.from({ length: MIN_DEFAULT_ITEM_ROWS }, () => (
    applyCurrencySnapshotToLineItem(createEmptyPurchaseDocumentItem(documentId), currencySnapshot)
  ))
);

const toFormInitialValues = (
  document: PurchaseDocument | undefined,
  config: PurchaseDocumentConfig,
  documentId: string,
): DefaultValues<PurchaseDocumentFormValues> => {
  if (!document) {
    const fallbackBaseCurrency = getCachedBaseCurrency();
    const fallbackDate = dayjs().format('YYYY-MM-DD');
    const fallbackCurrencySnapshot = buildDocumentCurrencySnapshot(
      fallbackBaseCurrency,
      undefined,
      fallbackDate,
      fallbackBaseCurrency,
    );
    const values: DefaultValues<PurchaseDocumentFormValues> = {
      document_date: dayjs(),
      discount_type: 'fixed',
      discount_value: 0,
      discount_amount: 0,
      ...fallbackCurrencySnapshot,
      items: createDefaultLineItems(documentId, fallbackCurrencySnapshot),
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
  onCancel,
  submitting,
}: PurchaseDocumentFormProps) => {
  const { t } = useI18n();
  const { message } = App.useApp();
  const { baseCurrency, baseCurrencyCode } = useBaseCurrency();
  const defaultCurrencyAppliedRef = useRef(Boolean(initialData?.document));
  const documentId = initialData?.document?.id ?? 'draft';
  const warehouseHelperKey = warehouseHelperKeysByType[config.type];

  const [createProductOpen, setCreateProductOpen] = useState(false);
  const [newProductName, setNewProductName] = useState('');
  const [newProductBarcode, setNewProductBarcode] = useState('');
  const [activeLineId, setActiveLineId] = useState<string | null>(null);
  const quickCreateForm = useProductQuickCreateForm();
  const [editProductOpen, setEditProductOpen] = useState(false);
  const quickEditForm = useProductQuickEditForm();

  const baseFormValues = toFormInitialValues(initialData?.document, config, documentId);
  const {
    control,
    handleSubmit,
    setValue,
  } = useForm<PurchaseDocumentFormValues, unknown, PurchaseDocumentFormValues>({
    defaultValues: {
      ...baseFormValues,
      items: initialData?.items?.length ? initialData.items : (baseFormValues.items ?? []),
    } as DefaultValues<PurchaseDocumentFormValues>,
  });
  const watchedItems = useWatch({ control, name: 'items' });
  const items = useMemo(() => watchedItems ?? [], [watchedItems]);
  const filledItemCount = useMemo(() => countFilledLineItems(items), [items]);
  const documentDate = useWatch({ control, name: 'document_date' });
  const watchedCostStatus = useWatch({ control, name: 'cost_status' });
  const watchedCurrencyCode = useWatch({ control, name: 'currency_code' });
  const watchedCurrencyName = useWatch({ control, name: 'currency_name' });
  const watchedCurrencySymbol = useWatch({ control, name: 'currency_symbol' });
  const watchedBaseCurrencyCode = useWatch({ control, name: 'base_currency_code' });
  const watchedExchangeRate = useWatch({ control, name: 'exchange_rate' });
  const watchedExchangeRateSource = useWatch({ control, name: 'exchange_rate_source' });
  const watchedExchangeRateBasis = useWatch({ control, name: 'exchange_rate_basis' });
  const watchedExchangeRateDate = useWatch({ control, name: 'exchange_rate_date' });

  const activeLineItem = useMemo(
    () => items.find((item) => item.id === activeLineId),
    [items, activeLineId],
  );

  const handleCreateProductRequest = useCallback((lineId: string, search: string) => {
    const value = search.trim();
    const isBarcodeLike = /^\d{6,}$/.test(value);
    setNewProductName(isBarcodeLike ? '' : value);
    setNewProductBarcode(isBarcodeLike ? value : '');
    setActiveLineId(lineId);
    setCreateProductOpen(true);
  }, []);

  const handleCreateProductCancel = useCallback(() => {
    setCreateProductOpen(false);
    setActiveLineId(null);
  }, []);

  useEffect(() => {
    if (!createProductOpen) return;
    const unit = activeLineItem?.unit || 'pcs';
    quickCreateForm.reset(buildQuickCreateDefaultValues({
      name: newProductName,
      sku: newProductBarcode,
      purchase_unit: unit,
      selling_unit: unit,
      sellable_units: [unit],
      purchase_price: activeLineItem?.price ? Number(activeLineItem.price) : undefined,
    }));
    // quickCreateForm.reset is a stable react-hook-form reference.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createProductOpen, newProductName, newProductBarcode, activeLineItem?.unit, activeLineItem?.price]);

  const handleCreateProductPersist = useCallback(async (data: StockFormData): Promise<Product> => {
    const sku = data.sku?.trim();
    if (sku) {
      const existing = products.find((product) => (product.sku || '').toLowerCase() === sku.toLowerCase());
      if (existing) {
        message.info('Barcode/SKU sudah terdaftar, gunakan produk yang sudah ada');
        return existing;
      }
    }

    return createProductRecord(data);
  }, [products, message]);

  const handleProductCreated = useCallback((product: Product) => {
    if (activeLineId) {
      const unit = product.purchase_unit || 'pcs';
      const nextItems = items.map((item) => (
        item.id === activeLineId
          ? {
            ...item,
            product_id: product.id,
            product_name: product.name,
            sku: product.sku,
            unit,
            price: getPurchasePrice(product, unit),
          }
          : item
      ));
      setValue('items', nextItems, { shouldDirty: true, shouldValidate: true });
    }

    setCreateProductOpen(false);
    setActiveLineId(null);
  }, [activeLineId, items, setValue]);

  const handleCreateProductSave = useCallback(async () => {
    try {
      const product = await quickCreateForm.submit(handleCreateProductPersist);
      if (product) {
        handleProductCreated(product);
      }
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('productQuickCreate.failed'));
    }
  }, [quickCreateForm, handleCreateProductPersist, handleProductCreated, message, t]);

  const handleEditProductRequest = useCallback((_lineId: string, productId: string) => {
    const product = products.find((candidate) => candidate.id === productId);
    if (!product) return;

    quickEditForm.loadProduct(product);
    setEditProductOpen(true);
  }, [products, quickEditForm]);

  const handleEditProductCancel = useCallback(() => {
    setEditProductOpen(false);
    quickEditForm.closeEditing();
  }, [quickEditForm]);

  const handleProductUpdated = useCallback((product: Product) => {
    // Semua baris yang memakai produk ini disinkronkan, bukan cuma baris yang
    // memicu edit.
    const nextItems = items.map((item) => {
      if (item.product_id !== product.id) return item;

      const unit = item.unit || product.purchase_unit;
      return {
        ...item,
        product_name: product.name,
        sku: product.sku,
        price: getPurchasePrice(product, unit),
      };
    });
    setValue('items', nextItems, { shouldDirty: true, shouldValidate: true });

    setEditProductOpen(false);
    quickEditForm.closeEditing();
  }, [items, quickEditForm, setValue]);

  const handleEditProductSave = useCallback(async () => {
    try {
      const product = await quickEditForm.submit(updateProductRecord);
      if (product) {
        handleProductUpdated(product);
      }
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('productQuickEdit.failed'));
    }
  }, [quickEditForm, handleProductUpdated, message, t]);

  const discountType = useWatch({ control, name: 'discount_type' }) ?? 'fixed';
  const discountValue = useWatch({ control, name: 'discount_value' }) ?? 0;
  const selectedTaxId = useWatch({ control, name: 'tax_id' });
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
      if (rate.base_currency_code !== baseCurrencyCode) return acc;
      if (!acc[rate.currency_code]) acc[rate.currency_code] = rate;
      return acc;
    }, {})
  ), [baseCurrencyCode, currencyRates]);
  const documentCurrencySnapshot = useMemo<DocumentCurrencySnapshot>(() => snapshotFromDocumentInput({
    currency_code: watchedCurrencyCode,
    currency_name: watchedCurrencyName,
    currency_symbol: watchedCurrencySymbol,
    base_currency_code: watchedBaseCurrencyCode,
    exchange_rate: watchedExchangeRate,
    exchange_rate_source: watchedExchangeRateSource,
    exchange_rate_basis: watchedExchangeRateBasis,
    exchange_rate_date: watchedExchangeRateDate,
  }, currencies.find((currency) => currency.code === normalizeCurrencyCode(watchedCurrencyCode, baseCurrencyCode)), dayjs.isDayjs(documentDate) ? documentDate.format('YYYY-MM-DD') : undefined, baseCurrency), [
    baseCurrency,
    baseCurrencyCode,
    currencies,
    documentDate,
    watchedBaseCurrencyCode,
    watchedCurrencyCode,
    watchedCurrencyName,
    watchedCurrencySymbol,
    watchedExchangeRate,
    watchedExchangeRateBasis,
    watchedExchangeRateDate,
    watchedExchangeRateSource,
  ]);
  const selectedTax = taxes.find((tax) => tax.id === selectedTaxId);
  const initialTaxSnapshot = selectedTaxId && selectedTaxId === initialData?.document?.tax_id
    ? initialData.document
    : undefined;
  const taxRate = selectedTax?.rate ?? initialTaxSnapshot?.tax_rate;
  const taxCalculationMode = selectedTax?.calculation_mode ?? initialTaxSnapshot?.tax_calculation_mode;
  const taxId = selectedTax?.id ?? initialTaxSnapshot?.tax_id;
  const taxName = selectedTax?.name ?? initialTaxSnapshot?.tax_name;
  const taxCode = selectedTax?.code ?? initialTaxSnapshot?.tax_code;
  const taxFlow = selectedTax?.tax_flow ?? initialTaxSnapshot?.tax_flow;
  const taxAccountId = selectedTax?.purchase_tax_account_id ?? initialTaxSnapshot?.tax_account_id;
  const taxAccountCode = selectedTax?.purchase_tax_account_code ?? initialTaxSnapshot?.tax_account_code;
  const taxAccountName = selectedTax?.purchase_tax_account_name ?? initialTaxSnapshot?.tax_account_name;
  const taxAccountType = selectedTax?.purchase_tax_account_type ?? initialTaxSnapshot?.tax_account_type;
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
      taxFlow,
      taxAccountId,
      taxAccountCode,
      taxAccountName,
      taxAccountType,
      taxAccountContext: 'purchase',
      taxes,
      config,
    }),
    [
      config,
      discountType,
      discountValue,
      items,
      taxAccountCode,
      taxAccountId,
      taxAccountName,
      taxAccountType,
      taxCalculationMode,
      taxCode,
      taxFlow,
      taxId,
      taxName,
      taxRate,
      taxes,
    ],
  );
  const summaryTaxOptions = useMemo(() => taxes.map((tax) => ({
    value: tax.id,
    label: `${tax.name} (${tax.rate}%)`,
  })), [taxes]);

  const handleItemsChange = useCallback((nextItems: PurchaseDocumentItem[]) => {
    setValue('items', nextItems, { shouldDirty: true, shouldValidate: true });
  }, [setValue]);
  const handleCurrencySnapshotChange = useCallback((snapshot: DocumentCurrencySnapshot, previousCurrencyCode?: string) => {
    const previousCode = normalizeCurrencyCode(previousCurrencyCode, snapshot.base_currency_code);

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

  useEffect(() => {
    if (defaultCurrencyAppliedRef.current || !baseCurrency) return;
    const snapshot = buildDocumentCurrencySnapshot(
      baseCurrency,
      undefined,
      dayjs.isDayjs(documentDate) ? documentDate.format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD'),
      baseCurrency,
    );

    setValue('currency_code', snapshot.currency_code, { shouldDirty: false, shouldValidate: true });
    setValue('currency_name', snapshot.currency_name, { shouldDirty: false });
    setValue('currency_symbol', snapshot.currency_symbol, { shouldDirty: false });
    setValue('base_currency_code', snapshot.base_currency_code, { shouldDirty: false });
    setValue('exchange_rate', snapshot.exchange_rate, { shouldDirty: false, shouldValidate: true });
    setValue('exchange_rate_source', snapshot.exchange_rate_source, { shouldDirty: false });
    setValue('exchange_rate_basis', snapshot.exchange_rate_basis, { shouldDirty: false });
    setValue('exchange_rate_date', snapshot.exchange_rate_date, { shouldDirty: false });
    defaultCurrencyAppliedRef.current = true;
  }, [baseCurrency, documentDate, setValue]);

  const handleTaxChange = useCallback((taxId?: string) => {
    const tax = taxes.find((candidate) => candidate.id === taxId);

    setValue('tax_name', tax?.name, { shouldDirty: true });
    setValue('tax_code', tax?.code, { shouldDirty: true });
    setValue('tax_rate', tax?.rate, { shouldDirty: true });
    setValue('tax_calculation_mode', tax?.calculation_mode, { shouldDirty: true });
    setValue('tax_flow', tax?.tax_flow, { shouldDirty: true });
    setValue('tax_account_id', tax?.purchase_tax_account_id, { shouldDirty: true });
    setValue('tax_account_code', tax?.purchase_tax_account_code, { shouldDirty: true });
    setValue('tax_account_name', tax?.purchase_tax_account_name, { shouldDirty: true });
    setValue('tax_account_type', tax?.purchase_tax_account_type, { shouldDirty: true });
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
        onEditProductRequest={handleEditProductRequest}
      />

      {config.behavior.hasPricing && (
        <DocumentTotalsSummary
          i18nPrefix="purchaseDocuments"
          discountPurpose="purchase"
          discountAccountType="EXPENSE"
          control={control}
          total={total}
          filledItemCount={filledItemCount}
          documentCurrencySnapshot={documentCurrencySnapshot}
          taxOptions={summaryTaxOptions}
          hasTax={config.behavior.hasTax}
          discountType={discountType}
          discountValue={discountValue}
          onDiscountTypeChange={(value) => setValue('discount_type', value, { shouldDirty: true, shouldValidate: true })}
          onDiscountValueChange={(value) => setValue('discount_value', value, { shouldDirty: true, shouldValidate: true })}
          onTaxChange={handleTaxChange}
        />
      )}

      <div className="flex w-full justify-end gap-2">
        {onCancel && <Button onClick={onCancel}>{t('common.cancel')}</Button>}
        <Button type="primary" htmlType="submit" loading={submitting}>
          {t('purchaseDocuments.saveDraft')}
        </Button>
      </div>

      <StockProductModal
        open={createProductOpen}
        editingId={null}
        control={quickCreateForm.control}
        errors={quickCreateForm.formState.errors}
        setValue={quickCreateForm.setValue}
        getValues={quickCreateForm.getValues}
        reset={quickCreateForm.reset}
        setIsModalOpen={setCreateProductOpen}
        onCancel={handleCreateProductCancel}
        onSave={handleCreateProductSave}
      />

      <StockProductModal
        open={editProductOpen}
        editingId={quickEditForm.editingProductId}
        control={quickEditForm.control}
        errors={quickEditForm.formState.errors}
        setValue={quickEditForm.setValue}
        getValues={quickEditForm.getValues}
        reset={quickEditForm.reset}
        setIsModalOpen={setEditProductOpen}
        onCancel={handleEditProductCancel}
        onSave={handleEditProductSave}
      />
    </form>
  );
};
