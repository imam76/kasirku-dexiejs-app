import { useCallback, useMemo } from 'react';
import { Button } from 'antd';
import { useForm, useWatch } from 'react-hook-form';
import type { DefaultValues } from 'react-hook-form';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Dayjs } from 'dayjs';
import dayjs from '@/lib/dayjs';
import type { SalesDocumentConfig } from '@/configs/sales-document';
import { useI18n } from '@/hooks/useI18n';
import { db } from '@/lib/db';
import { BASE_CURRENCY_CODE, DEFAULT_EXCHANGE_RATE } from '@/constants/currencies';
import { DocumentCurrencyFields } from '@/components/DocumentCurrencyFields';
import type { Contact, CurrencyRate, Department, Product, Project, PromoType, SalesDocument, SalesDocumentItem, Tax, Warehouse } from '@/types';
import { calculateDocumentTotal } from '@/utils/salesDocuments/calculateDocumentTotal';
import {
  applyCurrencySnapshotToLineItem,
  normalizeCurrencyCode,
  snapshotFromDocumentInput,
  type DocumentCurrencySnapshot,
} from '@/utils/documentCurrency';
import { DocumentHeader } from './DocumentHeader';
import { DocumentLineItems } from './DocumentLineItems';
import { DocumentSummary } from './DocumentSummary';

interface SalesDocumentFormProps {
  config: SalesDocumentConfig;
  initialData?: {
    document?: SalesDocument;
    items?: SalesDocumentItem[];
  };
  contacts: Contact[];
  taxes: Tax[];
  departments: Department[];
  projects: Project[];
  warehouses: Warehouse[];
  products: Product[];
  onSubmit: (input: { document: Partial<SalesDocument>; items: SalesDocumentItem[] }) => Promise<void>;
  onCancel?: () => void;
  submitting?: boolean;
}

export type SalesDocumentFormValues = Omit<Partial<SalesDocument>, 'document_date' | 'expired_at' | 'due_date'> & {
  document_date?: Dayjs;
  expired_at?: Dayjs;
  due_date?: Dayjs;
  items: SalesDocumentItem[];
};

const toFormInitialValues = (
  document: SalesDocument | undefined,
  config: SalesDocumentConfig,
): DefaultValues<SalesDocumentFormValues> => {
  if (!document) {
    const values: DefaultValues<SalesDocumentFormValues> = {
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
    }

    return values;
  }

  const values: DefaultValues<SalesDocumentFormValues> = {
    ...document,
    document_date: document.document_date ? dayjs(document.document_date) : undefined,
    expired_at: document.expired_at ? dayjs(document.expired_at) : undefined,
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

const omitLineItems = (values: SalesDocumentFormValues) => {
  const documentValues: Partial<SalesDocumentFormValues> = { ...values };
  delete documentValues.items;
  return documentValues;
};

export const SalesDocumentForm = ({
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
}: SalesDocumentFormProps) => {
  const { t } = useI18n();
  const {
    control,
    formState: { errors },
    handleSubmit,
    setValue,
  } = useForm<SalesDocumentFormValues, unknown, SalesDocumentFormValues>({
    defaultValues: {
      ...toFormInitialValues(initialData?.document, config),
      items: initialData?.items ?? [],
    } as DefaultValues<SalesDocumentFormValues>,
  });
  const watchedItems = useWatch({ control, name: 'items' });
  const items = useMemo(() => watchedItems ?? [], [watchedItems]);
  const documentDate = useWatch({ control, name: 'document_date' });
  const watchedCurrencyCode = useWatch({ control, name: 'currency_code' });
  const watchedExchangeRate = useWatch({ control, name: 'exchange_rate' });
  const watchedExchangeRateSource = useWatch({ control, name: 'exchange_rate_source' });
  const watchedExchangeRateBasis = useWatch({ control, name: 'exchange_rate_basis' });
  const watchedExchangeRateDate = useWatch({ control, name: 'exchange_rate_date' });
  const discountType = useWatch({ control, name: 'discount_type' }) ?? 'fixed';
  const discountValue = useWatch({ control, name: 'discount_value' }) ?? 0;
  const selectedTaxId = useWatch({ control, name: 'tax_id' });
  const selectedTax = taxes.find((tax) => tax.id === selectedTaxId);
  const initialTaxSnapshot = selectedTaxId && selectedTaxId === initialData?.document?.tax_id
    ? initialData.document
    : undefined;
  const taxRate = selectedTax?.rate ?? initialTaxSnapshot?.tax_rate;
  const taxCalculationMode = selectedTax?.calculation_mode ?? initialTaxSnapshot?.tax_calculation_mode;
  const taxId = selectedTax?.id ?? initialTaxSnapshot?.tax_id;
  const taxName = selectedTax?.name ?? initialTaxSnapshot?.tax_name;
  const taxCode = selectedTax?.code ?? initialTaxSnapshot?.tax_code;
  const documentId = initialData?.document?.id ?? 'draft';
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
  const handleItemsChange = useCallback((nextItems: SalesDocumentItem[]) => {
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

  const handleFinish = async (values: SalesDocumentFormValues) => {
    const documentValues = omitLineItems(values);
    const completedItems = total.items.filter((item) => item.product_id);

    await onSubmit({
      document: {
        ...documentValues,
        type: config.type,
        document_date: toIsoDate(values.document_date),
        expired_at: toIsoDate(values.expired_at),
        due_date: toIsoDate(values.due_date),
        discount_type: discountType,
        discount_value: Number(discountValue || 0),
        discount_amount: total.discount_amount,
      },
      items: completedItems,
    });
  };

  return (
    <form
      onSubmit={handleSubmit(handleFinish)}
      className="space-y-4"
    >
      <DocumentHeader
        config={config}
        control={control}
        errors={errors}
        setValue={setValue}
        contacts={contacts}
        taxes={taxes}
        departments={departments}
        projects={projects}
        warehouses={warehouses}
      />
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
      <DocumentLineItems
        config={config}
        documentId={documentId}
        items={items}
        calculatedItems={total.items}
        products={products}
        taxes={taxes}
        documentCurrencySnapshot={documentCurrencySnapshot}
        onChange={handleItemsChange}
      />
      <DocumentSummary
        config={config}
        control={control}
        total={total}
        documentCurrencySnapshot={documentCurrencySnapshot}
        taxes={taxes}
        discountType={discountType}
        discountValue={discountValue}
        onDiscountTypeChange={(value: PromoType) => setValue('discount_type', value, { shouldDirty: true, shouldValidate: true })}
        onDiscountValueChange={(value) => setValue('discount_value', value, { shouldDirty: true, shouldValidate: true })}
        onTaxChange={handleTaxChange}
      />
      <div className="flex w-full justify-end gap-2">
        {onCancel && <Button onClick={onCancel}>{t('common.cancel')}</Button>}
        <Button type="primary" htmlType="submit" loading={submitting}>
          {t('salesDocuments.saveDraft')}
        </Button>
      </div>
    </form>
  );
};
