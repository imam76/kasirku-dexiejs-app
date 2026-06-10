import { Button, Card, Select, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { Link } from '@tanstack/react-router';
import { ArrowLeft, FileCheck2, RefreshCw } from 'lucide-react';
import { getPurchaseDocumentTypePathSegment } from '@/configs/purchase-document';
import { usePurchaseCostReconciliation } from '@/hooks/usePurchaseCostReconciliation';
import type { PendingPurchaseCostRow } from '@/services/purchaseCostReconciliationService';
import type { PurchaseCostStatus } from '@/types';
import { formatCurrency, formatDate } from '@/utils/formatters';

const { Title, Text } = Typography;

const costStatusColor: Record<PurchaseCostStatus, string> = {
  FINAL: 'green',
  ESTIMATED: 'gold',
  PENDING: 'red',
};

const costStatusLabel: Record<PurchaseCostStatus, string> = {
  FINAL: 'Harga Final',
  ESTIMATED: 'Harga Sementara',
  PENDING: 'Belum Ada Harga',
};

const estimateSourceLabel: Record<string, string> = {
  LAST_PURCHASE_PRICE: 'Harga beli terakhir',
  PRODUCT_PURCHASE_PRICE: 'Harga master produk',
  MANUAL: 'Manual',
  UNKNOWN: 'Tidak diketahui',
};

export default function PendingPurchaseCosts() {
  const {
    pendingCosts,
    isLoadingPendingCosts,
    refetchPendingCosts,
  } = usePurchaseCostReconciliation();

  const columns: ColumnsType<PendingPurchaseCostRow> = [
    {
      title: 'Tanggal Terima',
      dataIndex: ['document', 'document_date'],
      width: 130,
      render: (value: string) => formatDate(value),
    },
    {
      title: 'Purchase Receipt',
      dataIndex: ['document', 'document_number'],
      render: (_, row) => (
        <Link
          to="/purchases/$documentType/$documentId"
          params={{
            documentType: getPurchaseDocumentTypePathSegment(row.document.type),
            documentId: row.document.id,
          }}
        >
          {row.document.document_number}
        </Link>
      ),
    },
    {
      title: 'Surat Jalan',
      dataIndex: ['document', 'delivery_note_number'],
      render: (value?: string) => value || '-',
    },
    {
      title: 'Supplier',
      dataIndex: ['document', 'supplier_name'],
      render: (value?: string) => value || '-',
    },
    {
      title: 'Produk',
      dataIndex: ['item', 'product_name'],
      render: (_, row) => (
        <div>
          <div className="font-medium text-gray-900">{row.item.product_name}</div>
          <div className="text-xs text-gray-500">
            {estimateSourceLabel[row.item.estimate_source || 'UNKNOWN']}
          </div>
        </div>
      ),
    },
    {
      title: 'Qty',
      key: 'qty',
      align: 'right',
      render: (_, row) => (
        <div className="text-right text-sm">
          <div>Terima: {formatCurrency(row.received_quantity)} {row.item.unit}</div>
          <div className="text-xs text-gray-500">Sisa: {formatCurrency(row.remaining_quantity)}</div>
          <div className="text-xs text-gray-500">Terjual: {formatCurrency(row.sold_quantity)}</div>
        </div>
      ),
    },
    {
      title: 'Harga',
      dataIndex: 'estimated_price',
      align: 'right',
      render: (value: number) => `Rp ${formatCurrency(value || 0)}`,
    },
    {
      title: 'Status',
      key: 'status',
      width: 150,
      render: (_, row) => {
        const status = row.item.cost_status ?? row.document.cost_status ?? 'FINAL';
        return <Tag color={costStatusColor[status]}>{costStatusLabel[status]}</Tag>;
      },
      filters: [
        { text: 'Harga Sementara', value: 'ESTIMATED' },
        { text: 'Belum Ada Harga', value: 'PENDING' },
      ],
      onFilter: (value, row) => (row.item.cost_status ?? row.document.cost_status) === value,
    },
    {
      title: 'Umur',
      dataIndex: 'age_days',
      align: 'right',
      width: 100,
      render: (value: number) => `${value} hari`,
    },
    {
      title: '',
      key: 'action',
      fixed: 'right',
      width: 160,
      render: (_, row) => (
        <Link
          to="/purchases/$documentType/$documentId/reconcile"
          params={{
            documentType: getPurchaseDocumentTypePathSegment(row.document.type),
            documentId: row.document.id,
          }}
        >
          <Button size="small" icon={<FileCheck2 size={14} />}>
            Rekonsiliasi
          </Button>
        </Link>
      ),
    },
  ];

  return (
    <div className="space-y-4 p-3 sm:p-4 md:p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <Title level={2} style={{ margin: 0 }}>Harga Belum Final</Title>
          <Text type="secondary">View pendukung untuk Purchase Receipt yang masih memakai HPP sementara.</Text>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/purchases">
            <Button icon={<ArrowLeft size={16} />}>Kembali</Button>
          </Link>
          <Button icon={<RefreshCw size={16} />} onClick={() => refetchPendingCosts()}>
            Refresh
          </Button>
        </div>
      </div>

      <Card size="small">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div className="text-sm text-gray-600">
            {pendingCosts.length} baris perlu finalisasi harga.
          </div>
          <Select
            className="w-full md:w-56"
            value="all"
            options={[{ value: 'all', label: 'Semua status cost' }]}
            disabled
          />
        </div>
      </Card>

      <Table
        rowKey={(row) => `${row.document.id}-${row.item.id}`}
        columns={columns}
        dataSource={pendingCosts}
        loading={isLoadingPendingCosts}
        scroll={{ x: true }}
      />
    </div>
  );
}
