import { useMemo, useState } from 'react';
import { Button, Form, Space } from 'antd';
import dayjs from '@/lib/dayjs';
import type { SalesDocumentConfig } from '@/configs/sales-document';
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

const toFormInitialValues = (document?: SalesDocument) => {
  if (!document) {
    return {
      document_date: dayjs(),
      payment_status: 'UNPAID',
    };
  }

  return {
    ...document,
    document_date: document.document_date ? dayjs(document.document_date) : undefined,
    expired_at: document.expired_at ? dayjs(document.expired_at) : undefined,
    due_date: document.due_date ? dayjs(document.due_date) : undefined,
  };
};

const toIsoDate = (value: unknown) => {
  if (!value) return undefined;
  if (dayjs.isDayjs(value)) return value.format('YYYY-MM-DD');
  return String(value);
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
  const [form] = Form.useForm();
  const [items, setItems] = useState<SalesDocumentItem[]>(initialData?.items ?? []);
  const [discountAmount, setDiscountAmount] = useState(initialData?.document?.discount_amount ?? 0);
  const selectedTaxId = Form.useWatch('tax_id', form);
  const selectedTax = taxes.find((tax) => tax.id === selectedTaxId);
  const documentId = initialData?.document?.id ?? 'draft';
  const total = useMemo(
    () => calculateDocumentTotal({
      items,
      discountAmount,
      taxRate: selectedTax?.rate ?? initialData?.document?.tax_rate,
      taxCalculationMode: selectedTax?.calculation_mode ?? initialData?.document?.tax_calculation_mode,
      config,
    }),
    [config, discountAmount, initialData?.document?.tax_calculation_mode, initialData?.document?.tax_rate, items, selectedTax],
  );

  const handleFinish = async (values: Record<string, unknown>) => {
    await onSubmit({
      document: {
        ...values,
        type: config.type,
        document_date: toIsoDate(values.document_date),
        expired_at: toIsoDate(values.expired_at),
        due_date: toIsoDate(values.due_date),
        discount_amount: discountAmount,
      },
      items: total.items,
    });
  };

  return (
    <Form
      form={form}
      layout="vertical"
      initialValues={toFormInitialValues(initialData?.document)}
      onFinish={handleFinish}
      className="space-y-4"
    >
      <DocumentHeader
        config={config}
        form={form}
        contacts={contacts}
        taxes={taxes}
        departments={departments}
        projects={projects}
      />
      <DocumentLineItems
        config={config}
        documentId={documentId}
        items={total.items}
        products={products}
        onChange={setItems}
      />
      <DocumentSummary
        config={config}
        total={total}
        discountAmount={discountAmount}
        onDiscountChange={setDiscountAmount}
      />
      <Space className="w-full justify-end">
        {onCancel && <Button onClick={onCancel}>Batal</Button>}
        <Button type="primary" htmlType="submit" loading={submitting}>
          Simpan Draft
        </Button>
      </Space>
    </Form>
  );
};
