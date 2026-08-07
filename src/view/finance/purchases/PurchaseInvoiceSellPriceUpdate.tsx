import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, InputNumber, Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useNavigate } from '@tanstack/react-router';
import { ArrowLeft, Save } from 'lucide-react';
import { getPurchaseDocumentTypePathSegment } from '@/configs/purchase-document';
import { useBulkUpdateProductSellingPrices } from '@/hooks/useBulkUpdateProductSellingPrices';
import { db } from '@/lib/db';
import type { PurchaseDocument } from '@/types';
import { formatCurrency, formatCurrencyInput, formatDate, parseCurrencyInput } from '@/utils/formatters';

const { Title, Text } = Typography;

interface PurchaseInvoiceSellPriceUpdateProps {
  documentId: string;
}

interface SellPriceLineInput {
  purchaseDocumentItemId: string;
  productId: string;
  productName: string;
  oldPurchasePrice: number;
  newPurchasePrice: number;
  oldSellingPrice: number;
  newSellingPrice: number;
}

export default function PurchaseInvoiceSellPriceUpdate({ documentId }: PurchaseInvoiceSellPriceUpdateProps) {
  const navigate = useNavigate();
  const { bulkUpdateSellingPrices, isUpdatingSellingPrices } = useBulkUpdateProductSellingPrices();
  const [document, setDocument] = useState<PurchaseDocument | undefined>();
  const [isLoading, setIsLoading] = useState(true);
  const [lines, setLines] = useState<SellPriceLineInput[]>([]);
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([]);

  useEffect(() => {
    let active = true;

    const load = async () => {
      setIsLoading(true);
      const [loadedDocument, loadedItems] = await Promise.all([
        db.purchaseDocuments.get(documentId),
        db.purchaseDocumentItems.where('document_id').equals(documentId).toArray(),
      ]);
      const loadedProducts = await db.products.bulkGet(loadedItems.map((item) => item.product_id));

      if (!active) return;

      setDocument(loadedDocument);
      const nextLines = loadedItems.flatMap((item, index) => {
        const product = loadedProducts[index];
        if (!product) return [];

        return [{
          purchaseDocumentItemId: item.id,
          productId: product.id,
          productName: item.product_name,
          oldPurchasePrice: Number(product.purchase_price || 0),
          newPurchasePrice: Number(item.price ?? 0),
          oldSellingPrice: Number(product.selling_price || 0),
          newSellingPrice: Number(product.selling_price || 0),
        }];
      });
      setLines(nextLines);
      setSelectedRowKeys(nextLines.map((line) => line.purchaseDocumentItemId));
      setIsLoading(false);
    };

    void load();
    return () => {
      active = false;
    };
  }, [documentId]);

  const updateLine = (lineId: string, patch: Partial<SellPriceLineInput>) => {
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

  const selectedUpdates = useMemo(() => {
    const selectedIds = new Set(selectedRowKeys);
    // Centang menentukan ikut-tidaknya baris, bukan apakah angkanya berubah —
    // supaya harga jual yang memang mau di-set 0 (atau tetap sama) tidak diam-diam terlewat.
    const selectedLines = lines.filter((line) => selectedIds.has(line.purchaseDocumentItemId));
    // Same product can appear on multiple invoice lines; keep only the last edited price per product.
    const updatesByProduct = new Map(selectedLines.map((line) => (
      [line.productId, { productId: line.productId, sellingPrice: line.newSellingPrice }]
    )));
    return [...updatesByProduct.values()];
  }, [lines, selectedRowKeys]);

  const handleSubmit = async () => {
    if (!document || selectedUpdates.length === 0) return;

    try {
      await bulkUpdateSellingPrices({
        updates: selectedUpdates,
        sourceDocumentId: document.id,
        sourceDocumentNumber: document.document_number,
      });
    } catch {
      return;
    }

    goBack();
  };

  const columns: ColumnsType<SellPriceLineInput> = [
    {
      title: 'Produk',
      dataIndex: 'productName',
      render: (_, line) => <div className="font-medium text-gray-900">{line.productName}</div>,
    },
    {
      title: 'Harga Beli Lama',
      dataIndex: 'oldPurchasePrice',
      align: 'right',
      width: 160,
      render: (value: number) => `Rp ${formatCurrency(value || 0)}`,
    },
    {
      title: 'Harga Beli Baru',
      dataIndex: 'newPurchasePrice',
      align: 'right',
      width: 160,
      render: (value: number) => `Rp ${formatCurrency(value || 0)}`,
    },
    {
      title: 'Harga Jual Saat Ini',
      dataIndex: 'oldSellingPrice',
      align: 'right',
      width: 160,
      render: (value: number) => `Rp ${formatCurrency(value || 0)}`,
    },
    {
      title: 'Harga Jual Baru',
      dataIndex: 'newSellingPrice',
      align: 'right',
      width: 180,
      render: (_, line) => (
        <InputNumber
          min={0}
          className="w-full"
          prefix="Rp"
          value={line.newSellingPrice}
          formatter={formatCurrencyInput}
          parser={parseCurrencyInput}
          onChange={(value) => updateLine(line.purchaseDocumentItemId, { newSellingPrice: Number(value || 0) })}
        />
      ),
    },
  ];

  if (isLoading) {
    return <div className="p-6">Memuat data produk...</div>;
  }

  if (!document || document.type !== 'PURCHASE_INVOICE') {
    return <div className="p-6"><Alert type="error" message="Purchase Invoice tidak ditemukan." /></div>;
  }

  return (
    <div className="space-y-4 p-3 sm:p-4 md:p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <Title level={2} style={{ margin: 0 }}>Update Harga Jual</Title>
          <Text type="secondary">
            {document.document_number} · {document.supplier_name || '-'} · {formatDate(document.document_date)}
          </Text>
        </div>
        <Button icon={<ArrowLeft size={16} />} onClick={goBack}>
          Kembali
        </Button>
      </div>

      {lines.length === 0 ? (
        <Alert type="success" message="Tidak ada produk pada invoice ini." />
      ) : (
        <>
          <Card size="small">
            <Table
              rowKey="purchaseDocumentItemId"
              columns={columns}
              dataSource={lines}
              pagination={false}
              scroll={{ x: true }}
              rowSelection={{
                selectedRowKeys,
                onChange: (keys) => setSelectedRowKeys(keys as string[]),
              }}
            />
          </Card>

          <div className="flex flex-col items-end gap-1">
            {selectedUpdates.length === 0 && (
              <Text type="secondary" className="text-xs">
                Pilih produk yang harga jualnya mau disimpan untuk mengaktifkan tombol simpan.
              </Text>
            )}
            <Button
              type="primary"
              icon={<Save size={16} />}
              loading={isUpdatingSellingPrices}
              disabled={selectedUpdates.length === 0}
              onClick={handleSubmit}
            >
              Simpan Harga Jual ({selectedUpdates.length})
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
