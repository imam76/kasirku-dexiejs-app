import { useEffect, useMemo, useState } from 'react';
import { Button, Card, Input, InputNumber, Modal, Space, Table, Tag, Typography } from 'antd';
import { useNavigate } from '@tanstack/react-router';
import { AlertTriangle } from 'lucide-react';
import type { ColumnsType } from 'antd/es/table';
import { getSalesDocumentConfig, SALES_DOCUMENT_TYPE_OPTIONS } from '@/configs/sales-document';
import { useI18n } from '@/hooks/useI18n';
import { useSalesDocuments } from '@/hooks/useSalesDocuments';
import { db } from '@/lib/db';
import type {
  SalesDocument,
  SalesDocumentItem,
  SalesDocumentStatus,
  SalesDocumentType,
  SalesInvoicePaymentStatus,
} from '@/types';
import { formatCurrency, formatDate } from '@/utils/formatters';
import { salesDocumentStatusLabelKeys, salesInvoicePaymentStatusLabelKeys } from '@/utils/salesDocuments/i18n';

const { Title, Text } = Typography;

const statusColor: Record<SalesDocumentStatus, string> = {
  DRAFT: 'gold',
  ISSUED: 'blue',
  CONVERTED: 'green',
  VOIDED: 'red',
};

const paymentStatusColor: Record<SalesInvoicePaymentStatus, string> = {
  UNPAID: 'red',
  PARTIAL: 'gold',
  PAID: 'green',
};

interface SalesDocumentDetailProps {
  documentId: string;
}

export default function SalesDocumentDetail({ documentId }: SalesDocumentDetailProps) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { issueDocument, voidDocument, convertDocument, payInvoice, isMutating } = useSalesDocuments();
  const [document, setDocument] = useState<SalesDocument | undefined>();
  const [items, setItems] = useState<SalesDocumentItem[]>([]);
  const [paidAmount, setPaidAmount] = useState<number>(0);

  const loadDocument = async () => {
    const [loadedDocument, loadedItems] = await Promise.all([
      db.salesDocuments.get(documentId),
      db.salesDocumentItems.where('document_id').equals(documentId).toArray(),
    ]);
    setDocument(loadedDocument);
    setItems(loadedItems);
    setPaidAmount(loadedDocument?.paid_amount ?? loadedDocument?.total_amount ?? 0);
  };

  useEffect(() => {
    loadDocument();
  }, [documentId]);

  const config = document ? getSalesDocumentConfig(document.type) : undefined;
  const nextConvertOptions = useMemo(() => {
    if (!document || document.status !== 'ISSUED') return [];
    const allowed: Record<SalesDocumentType, SalesDocumentType[]> = {
      SALES_QUOTATION: ['SALES_ORDER', 'SALES_INVOICE'],
      SALES_ORDER: ['SALES_DELIVERY', 'SALES_INVOICE'],
      SALES_DELIVERY: ['SALES_INVOICE'],
      SALES_INVOICE: [],
    };
    return allowed[document.type];
  }, [document]);

  if (!document || !config) {
    return <div className="p-6">{t('salesDocuments.notFound')}</div>;
  }

  const columns: ColumnsType<SalesDocumentItem> = [
    { title: t('salesDocuments.field.product'), dataIndex: 'product_name' },
    { title: t('salesDocuments.field.quantity'), dataIndex: 'quantity', width: 100 },
    { title: t('salesDocuments.field.deliveredQuantity'), dataIndex: 'delivered_quantity', width: 100, render: (value) => value ?? '-' },
    { title: t('salesDocuments.field.unit'), dataIndex: 'unit', width: 100 },
    ...(config.behavior.hasPricing ? [
      { title: t('salesDocuments.field.price'), dataIndex: 'price', width: 140, render: (value: number) => `Rp ${formatCurrency(value || 0)}` },
      { title: t('salesDocuments.field.discount'), dataIndex: 'discount_amount', width: 120, render: (value: number) => `Rp ${formatCurrency(value || 0)}` },
      { title: t('salesDocuments.field.tax'), dataIndex: 'tax_amount', width: 120, render: (value: number) => `Rp ${formatCurrency(value || 0)}` },
      { title: t('salesDocuments.field.subtotal'), dataIndex: 'subtotal', width: 140, render: (value: number) => `Rp ${formatCurrency(value || 0)}` },
    ] : []),
  ];
  const canEdit = document.status === 'DRAFT';
  const canVoid = (document.status === 'DRAFT' || document.status === 'ISSUED') &&
    !(document.type === 'SALES_INVOICE' && document.finance_transaction_id);
  const canRecordPayment = config.behavior.hasPaymentStatus && document.status === 'ISSUED';
  const statusTag = (
    <Tag className="m-0 px-2.5 py-0.5 text-xs font-semibold" color={statusColor[document.status]}>
      {t(salesDocumentStatusLabelKeys[document.status])}
    </Tag>
  );
  const paymentStatusTag = document.payment_status ? (
    <Tag className="m-0 px-2.5 py-0.5 text-xs font-semibold" color={paymentStatusColor[document.payment_status]}>
      {t(salesInvoicePaymentStatusLabelKeys[document.payment_status])}
    </Tag>
  ) : '-';
  const detailItems = [
    { key: 'customer', label: t('salesDocuments.field.customer'), value: document.customer_name },
    { key: 'status', label: t('salesDocuments.table.status'), value: statusTag },
    { key: 'date', label: t('salesDocuments.table.date'), value: formatDate(document.document_date) },
    ...(config.behavior.hasPaymentStatus ? [{
      key: 'paymentStatus',
      label: t('salesDocuments.field.paymentStatus'),
      value: paymentStatusTag,
      highlight: document.payment_status === 'UNPAID',
    }] : []),
    ...(config.behavior.hasDueDate ? [{
      key: 'dueDate',
      label: t('salesDocuments.field.dueDate'),
      value: document.due_date ? formatDate(document.due_date) : '-',
    }] : []),
    ...(config.behavior.allowDepartmentPicker ? [{
      key: 'department',
      label: t('salesDocuments.field.department'),
      value: document.department_name ?? '-',
    }] : []),
    ...(config.behavior.allowProjectPicker ? [{
      key: 'project',
      label: t('salesDocuments.field.project'),
      value: document.project_name ?? '-',
    }] : []),
    ...(config.behavior.hasTax ? [{
      key: 'tax',
      label: t('salesDocuments.field.tax'),
      value: document.tax_name ? `${document.tax_name} (${document.tax_rate}%)` : '-',
    }] : []),
    ...(document.status === 'VOIDED' ? [
      {
        key: 'voidedAt',
        label: t('salesDocuments.field.voidedAt'),
        value: document.voided_at ? formatDate(document.voided_at) : '-',
      },
      {
        key: 'voidReason',
        label: t('salesDocuments.field.voidReason'),
        value: document.void_reason || '-',
      },
    ] : []),
  ];

  const handleVoid = () => {
    let voidReason = '';

    Modal.confirm({
      title: t('salesDocuments.voidConfirmTitle'),
      content: (
        <div className="space-y-3">
          <Text type="secondary">
            {t('salesDocuments.voidConfirmContent')}
          </Text>
          <Input.TextArea
            rows={3}
            placeholder={t('salesDocuments.voidReasonPlaceholder')}
            onChange={(event) => {
              voidReason = event.target.value;
            }}
          />
        </div>
      ),
      okText: t('salesDocuments.void'),
      okButtonProps: { danger: true },
      onOk: async () => {
        const normalizedReason = voidReason.trim();
        if (!normalizedReason) {
          throw new Error(t('salesDocuments.voidReasonRequired'));
        }

        await voidDocument({ id: document.id, reason: normalizedReason });
        await loadDocument();
      },
    });
  };

  return (
    <div className="p-3 sm:p-4 md:p-6 space-y-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <Title level={2} style={{ margin: 0 }}>{document.document_number}</Title>
          <Text type="secondary">{t(config.titleKey)}</Text>
        </div>
        <Space wrap>
          {canEdit && (
            <Button
              onClick={() => navigate({
                to: '/finance/sales/$documentType/$documentId/edit',
                params: { documentType: document.type, documentId: document.id },
              })}
            >
              {t('salesDocuments.editDraft')}
            </Button>
          )}
          {document.status === 'DRAFT' && (
            <Button type="primary" loading={isMutating} onClick={async () => {
              await issueDocument(document.id);
              await loadDocument();
            }}>
              {t('salesDocuments.issue')}
            </Button>
          )}
          {nextConvertOptions.map((targetType) => (
            <Button
              key={targetType}
              loading={isMutating}
              onClick={async () => {
                const result = await convertDocument({ sourceId: document.id, targetType });
                navigate({
                  to: '/finance/sales/$documentType/$documentId',
                  params: { documentType: result.document.type, documentId: result.document.id },
                });
              }}
            >
              {t('salesDocuments.convertTo', {
                type: t(SALES_DOCUMENT_TYPE_OPTIONS.find((option) => option.value === targetType)?.labelKey ?? 'salesDocuments.table.type'),
              })}
            </Button>
          ))}
          {canVoid && (
            <Button
              danger
              icon={<AlertTriangle size={16} />}
              className="md:ml-3"
              onClick={handleVoid}
            >
              {t('salesDocuments.void')}
            </Button>
          )}
        </Space>
      </div>

      <Card>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {detailItems.map((item) => (
            <div
              key={item.key}
              className={`min-h-20 rounded border px-4 py-3 ${
                item.highlight ? 'border-red-200 bg-red-50/70' : 'border-gray-100 bg-gray-50/60'
              }`}
            >
              <div className="text-xs font-medium uppercase text-gray-500">{item.label}</div>
              <div className="mt-2 break-words text-sm font-semibold text-gray-900">{item.value}</div>
            </div>
          ))}
        </div>
        <div className="mt-4 border-t border-gray-100 pt-4">
          <div className="text-xs font-medium uppercase text-gray-500">{t('salesDocuments.field.notes')}</div>
          <div className="mt-2 min-h-10 whitespace-pre-wrap rounded border border-gray-100 bg-white px-3 py-2 text-sm text-gray-700">
            {document.notes || '-'}
          </div>
        </div>
      </Card>

      {canRecordPayment && (
        <Card size="small" title={t('salesDocuments.invoicePayment')}>
          <Space wrap>
            <InputNumber
              min={0}
              max={document.total_amount}
              value={paidAmount}
              onChange={(value) => setPaidAmount(Number(value || 0))}
            />
            <Button
              type="primary"
              loading={isMutating}
              disabled={document.status === 'VOIDED'}
              onClick={async () => {
                await payInvoice({ id: document.id, input: { paid_amount: paidAmount } });
                await loadDocument();
              }}
            >
              {t('salesDocuments.recordPayment')}
            </Button>
          </Space>
        </Card>
      )}

      <Table rowKey="id" columns={columns} dataSource={items} pagination={false} scroll={{ x: true }} />

      {config.behavior.hasPricing && (
        <Card size="small" className="ml-auto w-full max-w-md">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-4 text-sm">
              <span className="text-gray-500">{t('salesDocuments.field.subtotal')}</span>
              <span className="font-medium text-gray-900">Rp {formatCurrency(document.subtotal_amount || 0)}</span>
            </div>
            <div className="flex items-center justify-between gap-4 text-sm">
              <span className="text-gray-500">{t('salesDocuments.field.documentDiscount')}</span>
              <span className="font-medium text-gray-900">Rp {formatCurrency(document.discount_amount || 0)}</span>
            </div>
            {config.behavior.hasTax && (
              <div className="flex items-center justify-between gap-4 text-sm">
                <span className="text-gray-500">{t('salesDocuments.field.tax')}</span>
                <span className="font-medium text-gray-900">Rp {formatCurrency(document.tax_amount || 0)}</span>
              </div>
            )}
            <div className="flex items-end justify-between gap-4 border-t border-gray-200 pt-3">
              <span className="text-sm font-semibold text-gray-700">{t('salesDocuments.field.total')}</span>
              <span className="text-xl font-bold text-gray-950">Rp {formatCurrency(document.total_amount || 0)}</span>
            </div>
            {config.behavior.hasPaymentStatus && (
              <div className="flex items-center justify-between gap-4 rounded border border-green-100 bg-green-50 px-3 py-2 text-sm">
                <span className="font-medium text-green-700">{t('salesDocuments.field.paidAmount')}</span>
                <span className="font-semibold text-green-800">Rp {formatCurrency(document.paid_amount || 0)}</span>
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
