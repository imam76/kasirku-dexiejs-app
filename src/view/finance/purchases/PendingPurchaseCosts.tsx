import { Button, Select, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { Link } from '@tanstack/react-router';
import { ArrowLeft, FileCheck2, RefreshCw } from 'lucide-react';
import ManagementListCard from '@/components/ManagementListCard';
import { getPurchaseDocumentTypePathSegment } from '@/configs/purchase-document';
import { usePurchaseCostReconciliation } from '@/hooks/usePurchaseCostReconciliation';
import { useI18n } from '@/hooks/useI18n';
import type { PendingPurchaseCostRow } from '@/services/purchaseCostReconciliationService';
import type { PurchaseCostStatus } from '@/types';
import { formatCurrency, formatDate } from '@/utils/formatters';

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
  const { t } = useI18n();
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
      title: t('common.actions'),
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
    <ManagementListCard
      title="Harga Belum Final"
      icon={<FileCheck2 className="h-5 w-5 text-amber-700" />}
      actions={(
        <div className="flex flex-wrap justify-end gap-2">
          <Link to="/purchases">
            <Button icon={<ArrowLeft size={16} />}>{t('common.back')}</Button>
          </Link>
          <Button icon={<RefreshCw size={16} />} loading={isLoadingPendingCosts} onClick={() => void refetchPendingCosts()}>
            {t('common.refresh')}
          </Button>
        </div>
      )}
      toolbar={(
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
      )}
    >
      <Table
        rowKey={(row) => `${row.document.id}-${row.item.id}`}
        columns={columns}
        dataSource={pendingCosts}
        loading={isLoadingPendingCosts}
        scroll={{ x: 1300 }}
        pagination={{ pageSize: 20, showSizeChanger: true }}
      />
    </ManagementListCard>
  );
}
