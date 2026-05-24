import { useEffect, useMemo, useState } from 'react';
import { Button, Card, Descriptions, Input, InputNumber, Modal, Space, Table, Tag, Typography } from 'antd';
import { useNavigate } from '@tanstack/react-router';
import type { ColumnsType } from 'antd/es/table';
import { getSalesDocumentConfig, SALES_DOCUMENT_TYPE_OPTIONS } from '@/configs/sales-document';
import { useI18n } from '@/hooks/useI18n';
import { useSalesDocuments } from '@/hooks/useSalesDocuments';
import { db } from '@/lib/db';
import type { SalesDocument, SalesDocumentItem, SalesDocumentStatus, SalesDocumentType } from '@/types';
import { formatCurrency, formatDate } from '@/utils/formatters';
import { salesDocumentStatusLabelKeys, salesInvoicePaymentStatusLabelKeys } from '@/utils/salesDocuments/i18n';

const { Title, Text } = Typography;

const statusColor: Record<SalesDocumentStatus, string> = {
  DRAFT: 'default',
  ISSUED: 'blue',
  CONVERTED: 'green',
  VOIDED: 'red',
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
  const canRecordPayment = document.type === 'SALES_INVOICE' && document.status === 'ISSUED';

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
          {canVoid && <Button danger onClick={handleVoid}>{t('salesDocuments.void')}</Button>}
        </Space>
      </div>

      <Card>
        <Descriptions column={{ xs: 1, md: 2 }} bordered size="small">
          <Descriptions.Item label={t('salesDocuments.field.customer')}>{document.customer_name}</Descriptions.Item>
          <Descriptions.Item label={t('salesDocuments.table.status')}>
            <Tag color={statusColor[document.status]}>{t(salesDocumentStatusLabelKeys[document.status])}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label={t('salesDocuments.table.date')}>{formatDate(document.document_date)}</Descriptions.Item>
          <Descriptions.Item label={t('salesDocuments.field.dueDate')}>{document.due_date ? formatDate(document.due_date) : '-'}</Descriptions.Item>
          <Descriptions.Item label={t('salesDocuments.field.department')}>{document.department_name ?? '-'}</Descriptions.Item>
          <Descriptions.Item label={t('salesDocuments.field.project')}>{document.project_name ?? '-'}</Descriptions.Item>
          <Descriptions.Item label={t('salesDocuments.field.tax')}>{document.tax_name ? `${document.tax_name} (${document.tax_rate}%)` : '-'}</Descriptions.Item>
          <Descriptions.Item label={t('salesDocuments.field.paymentStatus')}>
            {document.payment_status ? t(salesInvoicePaymentStatusLabelKeys[document.payment_status]) : '-'}
          </Descriptions.Item>
          <Descriptions.Item label={t('salesDocuments.field.notes')}>{document.notes || '-'}</Descriptions.Item>
          {document.status === 'VOIDED' && (
            <>
              <Descriptions.Item label={t('salesDocuments.field.voidedAt')}>
                {document.voided_at ? formatDate(document.voided_at) : '-'}
              </Descriptions.Item>
              <Descriptions.Item label={t('salesDocuments.field.voidReason')}>{document.void_reason || '-'}</Descriptions.Item>
            </>
          )}
        </Descriptions>
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
        <Card size="small">
          <Descriptions column={1} size="small">
            <Descriptions.Item label={t('salesDocuments.field.subtotal')}>Rp {formatCurrency(document.subtotal_amount || 0)}</Descriptions.Item>
            <Descriptions.Item label={t('salesDocuments.field.documentDiscount')}>Rp {formatCurrency(document.discount_amount || 0)}</Descriptions.Item>
            <Descriptions.Item label={t('salesDocuments.field.tax')}>Rp {formatCurrency(document.tax_amount || 0)}</Descriptions.Item>
            <Descriptions.Item label={t('salesDocuments.field.total')}>Rp {formatCurrency(document.total_amount || 0)}</Descriptions.Item>
            <Descriptions.Item label={t('salesDocuments.field.paidAmount')}>Rp {formatCurrency(document.paid_amount || 0)}</Descriptions.Item>
          </Descriptions>
        </Card>
      )}
    </div>
  );
}
