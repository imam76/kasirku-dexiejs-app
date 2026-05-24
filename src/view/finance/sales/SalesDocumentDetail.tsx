import { useEffect, useMemo, useState } from 'react';
import { Button, Card, Descriptions, Input, InputNumber, Modal, Space, Table, Tag, Typography } from 'antd';
import { useNavigate } from '@tanstack/react-router';
import type { ColumnsType } from 'antd/es/table';
import { getSalesDocumentConfig, SALES_DOCUMENT_TYPE_OPTIONS } from '@/configs/sales-document';
import { useSalesDocuments } from '@/hooks/useSalesDocuments';
import { db } from '@/lib/db';
import type { SalesDocument, SalesDocumentItem, SalesDocumentStatus, SalesDocumentType } from '@/types';
import { formatCurrency, formatDate } from '@/utils/formatters';

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
    return <div className="p-6">Dokumen tidak ditemukan.</div>;
  }

  const columns: ColumnsType<SalesDocumentItem> = [
    { title: 'Produk', dataIndex: 'product_name' },
    { title: 'Qty', dataIndex: 'quantity', width: 100 },
    { title: 'Qty Kirim', dataIndex: 'delivered_quantity', width: 100, render: (value) => value ?? '-' },
    { title: 'Unit', dataIndex: 'unit', width: 100 },
    ...(config.behavior.hasPricing ? [
      { title: 'Harga', dataIndex: 'price', width: 140, render: (value: number) => `Rp ${formatCurrency(value || 0)}` },
      { title: 'Diskon', dataIndex: 'discount_amount', width: 120, render: (value: number) => `Rp ${formatCurrency(value || 0)}` },
      { title: 'Pajak', dataIndex: 'tax_amount', width: 120, render: (value: number) => `Rp ${formatCurrency(value || 0)}` },
      { title: 'Subtotal', dataIndex: 'subtotal', width: 140, render: (value: number) => `Rp ${formatCurrency(value || 0)}` },
    ] : []),
  ];
  const canEdit = document.status === 'DRAFT';
  const canVoid = (document.status === 'DRAFT' || document.status === 'ISSUED') &&
    !(document.type === 'SALES_INVOICE' && document.finance_transaction_id);
  const canRecordPayment = document.type === 'SALES_INVOICE' && document.status === 'ISSUED';

  const handleVoid = () => {
    let voidReason = '';

    Modal.confirm({
      title: 'Batalkan dokumen?',
      content: (
        <div className="space-y-3">
          <Text type="secondary">
            Dokumen akan menjadi read-only. Stok delivery yang sudah terbit akan dikembalikan.
          </Text>
          <Input.TextArea
            rows={3}
            placeholder="Alasan pembatalan"
            onChange={(event) => {
              voidReason = event.target.value;
            }}
          />
        </div>
      ),
      okText: 'Void',
      okButtonProps: { danger: true },
      onOk: async () => {
        const normalizedReason = voidReason.trim();
        if (!normalizedReason) {
          throw new Error('Alasan pembatalan wajib diisi.');
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
          <Text type="secondary">{config.title}</Text>
        </div>
        <Space wrap>
          {canEdit && (
            <Button
              onClick={() => navigate({
                to: '/finance/sales/$documentType/$documentId/edit',
                params: { documentType: document.type, documentId: document.id },
              })}
            >
              Edit Draft
            </Button>
          )}
          {document.status === 'DRAFT' && (
            <Button type="primary" loading={isMutating} onClick={async () => {
              await issueDocument(document.id);
              await loadDocument();
            }}>
              Terbitkan
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
              Convert ke {SALES_DOCUMENT_TYPE_OPTIONS.find((option) => option.value === targetType)?.label}
            </Button>
          ))}
          {canVoid && <Button danger onClick={handleVoid}>Void</Button>}
        </Space>
      </div>

      <Card>
        <Descriptions column={{ xs: 1, md: 2 }} bordered size="small">
          <Descriptions.Item label="Customer">{document.customer_name}</Descriptions.Item>
          <Descriptions.Item label="Status"><Tag color={statusColor[document.status]}>{document.status}</Tag></Descriptions.Item>
          <Descriptions.Item label="Tanggal">{formatDate(document.document_date)}</Descriptions.Item>
          <Descriptions.Item label="Jatuh Tempo">{document.due_date ? formatDate(document.due_date) : '-'}</Descriptions.Item>
          <Descriptions.Item label="Department">{document.department_name ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="Project">{document.project_name ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="Pajak">{document.tax_name ? `${document.tax_name} (${document.tax_rate}%)` : '-'}</Descriptions.Item>
          <Descriptions.Item label="Status Bayar">{document.payment_status ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="Catatan">{document.notes || '-'}</Descriptions.Item>
          {document.status === 'VOIDED' && (
            <>
              <Descriptions.Item label="Dibatalkan Pada">
                {document.voided_at ? formatDate(document.voided_at) : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="Alasan Void">{document.void_reason || '-'}</Descriptions.Item>
            </>
          )}
        </Descriptions>
      </Card>

      {canRecordPayment && (
        <Card size="small" title="Pembayaran Invoice">
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
              Catat Pembayaran
            </Button>
          </Space>
        </Card>
      )}

      <Table rowKey="id" columns={columns} dataSource={items} pagination={false} scroll={{ x: true }} />

      {config.behavior.hasPricing && (
        <Card size="small">
          <Descriptions column={1} size="small">
            <Descriptions.Item label="Subtotal">Rp {formatCurrency(document.subtotal_amount || 0)}</Descriptions.Item>
            <Descriptions.Item label="Diskon Dokumen">Rp {formatCurrency(document.discount_amount || 0)}</Descriptions.Item>
            <Descriptions.Item label="Pajak">Rp {formatCurrency(document.tax_amount || 0)}</Descriptions.Item>
            <Descriptions.Item label="Total">Rp {formatCurrency(document.total_amount || 0)}</Descriptions.Item>
            <Descriptions.Item label="Terbayar">Rp {formatCurrency(document.paid_amount || 0)}</Descriptions.Item>
          </Descriptions>
        </Card>
      )}
    </div>
  );
}
