import { useCallback, useMemo } from 'react';
import { Button, Card, DatePicker, Input, InputNumber, Select } from 'antd';
import { Controller, useForm, useWatch } from 'react-hook-form';
import type { DefaultValues } from 'react-hook-form';
import type { Dayjs } from 'dayjs';
import dayjs from '@/lib/dayjs';
import type { PurchaseDocumentConfig } from '@/configs/purchase-document';
import { useI18n } from '@/hooks/useI18n';
import type { Contact, Department, Product, Project, PurchaseDocument, PurchaseDocumentItem, Tax } from '@/types';
import { calculateDocumentTotal } from '@/utils/documentTotals';
import { formatCurrency } from '@/utils/formatters';
import { PurchaseDocumentLineItems } from './PurchaseDocumentLineItems';

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

const toFormInitialValues = (
  document: PurchaseDocument | undefined,
  config: PurchaseDocumentConfig,
): DefaultValues<PurchaseDocumentFormValues> => {
  if (!document) {
    const values: DefaultValues<PurchaseDocumentFormValues> = {
      document_date: dayjs(),
      discount_amount: 0,
      items: [],
    };

    if (config.behavior.hasPaymentStatus) {
      values.payment_status = 'UNPAID';
      values.paid_amount = 0;
    }

    return values;
  }

  const values: DefaultValues<PurchaseDocumentFormValues> = {
    ...document,
    document_date: document.document_date ? dayjs(document.document_date) : undefined,
    required_date: document.required_date ? dayjs(document.required_date) : undefined,
    quotation_due_date: document.quotation_due_date ? dayjs(document.quotation_due_date) : undefined,
    due_date: document.due_date ? dayjs(document.due_date) : undefined,
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

export const PurchaseDocumentForm = ({
  config,
  initialData,
  contacts,
  taxes,
  departments,
  projects,
  products,
  onSubmit,
  onCancel,
  submitting,
}: PurchaseDocumentFormProps) => {
  const { t } = useI18n();
  const documentId = initialData?.document?.id ?? 'draft';
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
  const discountAmount = useWatch({ control, name: 'discount_amount' }) ?? 0;
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
  const total = useMemo(
    () => calculateDocumentTotal({
      items,
      discountAmount,
      taxRate,
      taxCalculationMode,
      taxId,
      taxName,
      taxCode,
      taxes,
      config,
    }),
    [config, discountAmount, items, taxCalculationMode, taxCode, taxId, taxName, taxRate, taxes],
  );

  const handleItemsChange = useCallback((nextItems: PurchaseDocumentItem[]) => {
    setValue('items', nextItems, { shouldDirty: true, shouldValidate: true });
  }, [setValue]);

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
        discount_amount: Number(discountAmount || 0),
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
            name="warehouse_name"
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

      <PurchaseDocumentLineItems
        config={config}
        documentId={documentId}
        items={items}
        calculatedItems={total.items}
        products={products}
        taxes={taxes}
        onChange={handleItemsChange}
      />

      {config.behavior.hasPricing && (
        <Card size="small" className="ml-auto w-full max-w-md">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-gray-500">{t('purchaseDocuments.field.subtotal')}</span>
              <span className="font-medium text-gray-900">Rp {formatCurrency(total.subtotal_amount || 0)}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-gray-500">{t('purchaseDocuments.field.documentDiscount')}</span>
              <Controller
                name="discount_amount"
                control={control}
                render={({ field }) => (
                  <InputNumber
                    min={0}
                    className="w-40"
                    value={Number(field.value || 0)}
                    onChange={(value) => field.onChange(Number(value || 0))}
                  />
                )}
              />
            </div>
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
                  <span className="font-medium text-gray-900">Rp {formatCurrency(total.tax_amount || 0)}</span>
                </div>
              </>
            )}
            <div className="flex items-center justify-between gap-4 border-t border-gray-100 pt-3">
              <span className="text-sm font-medium text-gray-700">{t('purchaseDocuments.field.total')}</span>
              <span className="text-lg font-semibold text-gray-900">Rp {formatCurrency(total.total_amount || 0)}</span>
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
    </form>
  );
};
