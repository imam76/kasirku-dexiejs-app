import { useCallback, useMemo } from 'react';
import { Button } from 'antd';
import { useForm, useWatch } from 'react-hook-form';
import type { DefaultValues } from 'react-hook-form';
import type { Dayjs } from 'dayjs';
import dayjs from '@/lib/dayjs';
import type { SalesDocumentConfig } from '@/configs/sales-document';
import { useI18n } from '@/hooks/useI18n';
import type { Contact, Department, Product, Project, SalesDocument, SalesDocumentItem, Tax } from '@/types';
import { calculateDocumentTotal } from '@/utils/salesDocuments/calculateDocumentTotal';
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

const toFormInitialValues = (document?: SalesDocument): DefaultValues<SalesDocumentFormValues> => {
  if (!document) {
    return {
      document_date: dayjs(),
      payment_status: 'UNPAID' as const,
      discount_amount: 0,
      items: [],
    };
  }

  return {
    ...document,
    document_date: document.document_date ? dayjs(document.document_date) : undefined,
    expired_at: document.expired_at ? dayjs(document.expired_at) : undefined,
    due_date: document.due_date ? dayjs(document.due_date) : undefined,
    discount_amount: document.discount_amount ?? 0,
  };
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
      ...toFormInitialValues(initialData?.document),
      items: initialData?.items ?? [],
    } as DefaultValues<SalesDocumentFormValues>,
  });
  const watchedItems = useWatch({ control, name: 'items' });
  const items = useMemo(() => watchedItems ?? [], [watchedItems]);
  const discountAmount = useWatch({ control, name: 'discount_amount' }) ?? 0;
  const selectedTaxId = useWatch({ control, name: 'tax_id' });
  const selectedTax = taxes.find((tax) => tax.id === selectedTaxId);
  const taxRate = selectedTax?.rate ?? initialData?.document?.tax_rate;
  const taxCalculationMode = selectedTax?.calculation_mode ?? initialData?.document?.tax_calculation_mode;
  const taxId = selectedTax?.id ?? initialData?.document?.tax_id;
  const taxName = selectedTax?.name ?? initialData?.document?.tax_name;
  const taxCode = selectedTax?.code ?? initialData?.document?.tax_code;
  const documentId = initialData?.document?.id ?? 'draft';
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
  const handleItemsChange = useCallback((nextItems: SalesDocumentItem[]) => {
    setValue('items', nextItems, { shouldDirty: true, shouldValidate: true });
  }, [setValue]);

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
        discount_amount: discountAmount,
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
      />
      <DocumentLineItems
        config={config}
        documentId={documentId}
        items={items}
        calculatedItems={total.items}
        products={products}
        taxes={taxes}
        onChange={handleItemsChange}
      />
      <DocumentSummary
        config={config}
        total={total}
        discountAmount={discountAmount}
        onDiscountChange={(value) => setValue('discount_amount', value, { shouldDirty: true, shouldValidate: true })}
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
