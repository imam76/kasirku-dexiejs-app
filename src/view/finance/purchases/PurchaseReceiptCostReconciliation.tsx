import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, DatePicker, Input, InputNumber, Select, Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useNavigate } from '@tanstack/react-router';
import { ArrowLeft, Save } from 'lucide-react';
import dayjs from '@/lib/dayjs';
import { getPurchaseDocumentTypePathSegment } from '@/configs/purchase-document';
import { usePurchaseCostReconciliation } from '@/hooks/usePurchaseCostReconciliation';
import { db } from '@/lib/db';
import type { PurchaseAdditionalCostTreatment, PurchaseDocument, PurchaseDocumentItem } from '@/types';
import { formatCurrency, formatDate } from '@/utils/formatters';

const { Title, Text } = Typography;

interface PurchaseReceiptCostReconciliationProps {
  documentId: string;
}

interface ReconciliationLineInput {
  purchaseDocumentItemId: string;
  productName: string;
  receivedQuantity: number;
  unit: string;
  estimatedPrice: number;
  finalPrice: number;
}

const getReceivedQuantity = (item: PurchaseDocumentItem) => Number(item.received_quantity ?? item.quantity ?? 0);

export default function PurchaseReceiptCostReconciliation({ documentId }: PurchaseReceiptCostReconciliationProps) {
  const navigate = useNavigate();
  const { reconcilePurchaseReceiptCost, isReconciling } = usePurchaseCostReconciliation();
  const [document, setDocument] = useState<PurchaseDocument | undefined>();
  const [isLoading, setIsLoading] = useState(true);
  const [supplierInvoiceNumber, setSupplierInvoiceNumber] = useState('');
  const [supplierInvoiceDate, setSupplierInvoiceDate] = useState<string | undefined>(dayjs().format('YYYY-MM-DD'));
  const [additionalCostTreatment, setAdditionalCostTreatment] = useState<PurchaseAdditionalCostTreatment>('IGNORE_FOR_MVP');
  const [additionalCostAmount, setAdditionalCostAmount] = useState(0);
  const [supplierDiscountAmount, setSupplierDiscountAmount] = useState(0);
  const [supplierTaxAmount, setSupplierTaxAmount] = useState(0);
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<ReconciliationLineInput[]>([]);

  useEffect(() => {
    let active = true;

    const load = async () => {
      setIsLoading(true);
      const [loadedDocument, loadedItems] = await Promise.all([
        db.purchaseDocuments.get(documentId),
        db.purchaseDocumentItems.where('document_id').equals(documentId).toArray(),
      ]);

      if (!active) return;
      setDocument(loadedDocument);
      setSupplierInvoiceNumber(loadedDocument?.supplier_invoice_number ?? '');
      setSupplierInvoiceDate(loadedDocument?.supplier_invoice_date ?? dayjs().format('YYYY-MM-DD'));
      setAdditionalCostTreatment(loadedDocument?.additional_cost_treatment ?? 'IGNORE_FOR_MVP');
      setAdditionalCostAmount(Number(loadedDocument?.additional_cost_amount || 0));
      setSupplierDiscountAmount(Number(loadedDocument?.supplier_discount_amount || 0));
      setSupplierTaxAmount(Number(loadedDocument?.supplier_tax_amount || 0));
      setLines(loadedItems
        .filter((item) => (item.cost_status ?? loadedDocument?.cost_status ?? 'FINAL') !== 'FINAL')
        .map((item) => ({
          purchaseDocumentItemId: item.id,
          productName: item.product_name,
          receivedQuantity: getReceivedQuantity(item),
          unit: item.unit,
          estimatedPrice: Number(item.estimated_price ?? item.price ?? 0),
          finalPrice: Number(item.final_price ?? item.price ?? item.estimated_price ?? 0),
        })));
      setIsLoading(false);
    };

    void load();
    return () => {
      active = false;
    };
  }, [documentId]);

  const totalEstimated = useMemo(
    () => lines.reduce((sum, line) => sum + line.receivedQuantity * line.estimatedPrice, 0),
    [lines],
  );
  const totalFinal = useMemo(
    () => lines.reduce((sum, line) => sum + line.receivedQuantity * line.finalPrice, 0),
    [lines],
  );

  const updateLine = (lineId: string, patch: Partial<ReconciliationLineInput>) => {
    setLines((current) => current.map((line) => (
      line.purchaseDocumentItemId === lineId ? { ...line, ...patch } : line
    )));
  };

  const goBack = () => {
    if (!document) {
      navigate({ to: '/purchases' });
      return;
    }

    navigate({
      to: '/purchases/$documentType/$documentId',
      params: {
        documentType: getPurchaseDocumentTypePathSegment(document.type),
        documentId: document.id,
      },
    });
  };

  const handleSubmit = async () => {
    if (!document) return;

    await reconcilePurchaseReceiptCost({
      purchaseDocumentId: document.id,
      supplierInvoiceNumber,
      supplierInvoiceDate,
      additionalCostTreatment,
      additionalCostAmount,
      supplierDiscountAmount,
      supplierTaxAmount,
      notes,
      items: lines.map((line) => ({
        purchaseDocumentItemId: line.purchaseDocumentItemId,
        invoicedQuantity: line.receivedQuantity,
        finalPrice: line.finalPrice,
      })),
    });
    goBack();
  };

  const columns: ColumnsType<ReconciliationLineInput> = [
    {
      title: 'Produk',
      dataIndex: 'productName',
      render: (_, line) => (
        <div>
          <div className="font-medium text-gray-900">{line.productName}</div>
          <div className="text-xs text-gray-500">
            Qty invoice MVP mengikuti qty terima: {formatCurrency(line.receivedQuantity)} {line.unit}
          </div>
        </div>
      ),
    },
    {
      title: 'Harga Sementara',
      dataIndex: 'estimatedPrice',
      align: 'right',
      width: 160,
      render: (value: number) => `Rp ${formatCurrency(value || 0)}`,
    },
    {
      title: 'Harga Final',
      dataIndex: 'finalPrice',
      align: 'right',
      width: 180,
      render: (_, line) => (
        <InputNumber
          min={0}
          className="w-full"
          value={line.finalPrice}
          formatter={(value) => `Rp ${formatCurrency(Number(value || 0))}`}
          parser={(value) => Number(String(value || '').replace(/[^\d.-]/g, ''))}
          onChange={(value) => updateLine(line.purchaseDocumentItemId, { finalPrice: Number(value || 0) })}
        />
      ),
    },
    {
      title: 'Variance',
      key: 'variance',
      align: 'right',
      width: 150,
      render: (_, line) => `Rp ${formatCurrency((line.finalPrice - line.estimatedPrice) * line.receivedQuantity)}`,
    },
  ];

  if (isLoading) {
    return <div className="p-6">Memuat rekonsiliasi...</div>;
  }

  if (!document || document.type !== 'PURCHASE_RECEIPT') {
    return <div className="p-6"><Alert type="error" message="Purchase Receipt tidak ditemukan." /></div>;
  }

  return (
    <div className="space-y-4 p-3 sm:p-4 md:p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <Title level={2} style={{ margin: 0 }}>Rekonsiliasi HPP</Title>
          <Text type="secondary">
            {document.document_number} · {document.supplier_name || '-'} · {formatDate(document.document_date)}
          </Text>
        </div>
        <Button icon={<ArrowLeft size={16} />} onClick={goBack}>
          Kembali
        </Button>
      </div>

      {lines.length === 0 ? (
        <Alert type="success" message="Semua item pada Purchase Receipt ini sudah final." />
      ) : (
        <>
          <Card size="small">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">Nomor Invoice Supplier</label>
                <Input value={supplierInvoiceNumber} onChange={(event) => setSupplierInvoiceNumber(event.target.value)} />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">Tanggal Invoice Supplier</label>
                <DatePicker
                  className="w-full"
                  value={supplierInvoiceDate ? dayjs(supplierInvoiceDate) : null}
                  onChange={(value) => setSupplierInvoiceDate(value ? value.format('YYYY-MM-DD') : undefined)}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">Perlakuan Biaya Tambahan</label>
                <Select
                  className="w-full"
                  value={additionalCostTreatment}
                  options={[
                    { value: 'INVENTORY_COST', label: 'Masuk HPP Persediaan' },
                    { value: 'OPERATING_EXPENSE', label: 'Biaya Operasional' },
                    { value: 'IGNORE_FOR_MVP', label: 'Abaikan untuk MVP' },
                  ]}
                  onChange={(value) => setAdditionalCostTreatment(value)}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">Biaya Tambahan</label>
                <InputNumber className="w-full" min={0} value={additionalCostAmount} onChange={(value) => setAdditionalCostAmount(Number(value || 0))} />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">Diskon Supplier</label>
                <InputNumber className="w-full" min={0} value={supplierDiscountAmount} onChange={(value) => setSupplierDiscountAmount(Number(value || 0))} />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">Pajak Supplier</label>
                <InputNumber className="w-full" min={0} value={supplierTaxAmount} onChange={(value) => setSupplierTaxAmount(Number(value || 0))} />
              </div>
              <div className="md:col-span-2">
                <label className="mb-1.5 block text-sm font-medium text-gray-700">Catatan</label>
                <Input.TextArea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} />
              </div>
            </div>
          </Card>

          <Card size="small">
            <Table
              rowKey="purchaseDocumentItemId"
              columns={columns}
              dataSource={lines}
              pagination={false}
              scroll={{ x: true }}
            />
            <div className="mt-4 flex flex-col items-end gap-1 text-sm">
              <div>Estimasi: <span className="font-semibold">Rp {formatCurrency(totalEstimated)}</span></div>
              <div>Final sebelum biaya: <span className="font-semibold">Rp {formatCurrency(totalFinal)}</span></div>
              <div>Variance: <span className="font-semibold">Rp {formatCurrency(totalFinal - totalEstimated)}</span></div>
            </div>
          </Card>

          <div className="flex justify-end">
            <Button type="primary" icon={<Save size={16} />} loading={isReconciling} onClick={handleSubmit}>
              Simpan Rekonsiliasi
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
