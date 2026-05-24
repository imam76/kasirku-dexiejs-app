import { useMemo, useState } from 'react';
import { Button, Card, Input, Select, Space, Table, Tag, Typography } from 'antd';
import { Link } from '@tanstack/react-router';
import { Eye, Plus } from 'lucide-react';
import type { ColumnsType } from 'antd/es/table';
import { SALES_DOCUMENT_TYPE_OPTIONS } from '@/configs/sales-document';
import { useSalesDocuments } from '@/hooks/useSalesDocuments';
import type { SalesDocument, SalesDocumentStatus, SalesDocumentType } from '@/types';
import { formatCurrency, formatDate } from '@/utils/formatters';

const { Title, Text } = Typography;

const statusColor: Record<SalesDocumentStatus, string> = {
  DRAFT: 'default',
  ISSUED: 'blue',
  CONVERTED: 'green',
  VOIDED: 'red',
};

export default function SalesDocumentsManagement() {
  const { documents } = useSalesDocuments();
  const [typeFilter, setTypeFilter] = useState<SalesDocumentType | 'ALL'>('ALL');
  const [searchText, setSearchText] = useState('');

  const filteredDocuments = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    return documents.filter((document) => {
      const matchesType = typeFilter === 'ALL' || document.type === typeFilter;
      const matchesSearch = !query || [
        document.document_number,
        document.customer_name,
        document.project_name,
        document.department_name,
      ].some((value) => value?.toLowerCase().includes(query));

      return matchesType && matchesSearch;
    });
  }, [documents, searchText, typeFilter]);

  const columns: ColumnsType<SalesDocument> = [
    {
      title: 'No Dokumen',
      dataIndex: 'document_number',
      render: (value: string, record) => (
        <Link to="/finance/sales/$documentType/$documentId" params={{ documentType: record.type, documentId: record.id }}>
          {value}
        </Link>
      ),
    },
    {
      title: 'Tipe',
      dataIndex: 'type',
      render: (value: SalesDocumentType) => SALES_DOCUMENT_TYPE_OPTIONS.find((option) => option.value === value)?.label ?? value,
      width: 150,
    },
    {
      title: 'Customer',
      dataIndex: 'customer_name',
    },
    {
      title: 'Tanggal',
      dataIndex: 'document_date',
      render: (value: string) => formatDate(value),
      width: 130,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      render: (value: SalesDocumentStatus) => <Tag color={statusColor[value]}>{value}</Tag>,
      width: 120,
    },
    {
      title: 'Bayar',
      dataIndex: 'payment_status',
      render: (value: string | undefined) => value ? <Tag>{value}</Tag> : '-',
      width: 110,
    },
    {
      title: 'Total',
      dataIndex: 'total_amount',
      align: 'right',
      render: (value: number | undefined) => value === undefined ? '-' : `Rp ${formatCurrency(value)}`,
      width: 150,
    },
    {
      title: '',
      key: 'action',
      fixed: 'right',
      width: 110,
      render: (_, record) => (
        <Link to="/finance/sales/$documentType/$documentId" params={{ documentType: record.type, documentId: record.id }}>
          <Button size="small" icon={<Eye size={14} />}>
            Detail
          </Button>
        </Link>
      ),
    },
  ];

  return (
    <div className="p-3 sm:p-4 md:p-6 space-y-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <Title level={2} style={{ margin: 0 }}>Sales Documents</Title>
          <Text type="secondary">Quotation, order, delivery, dan invoice di jalur finance sales.</Text>
        </div>
        <Space wrap>
          {SALES_DOCUMENT_TYPE_OPTIONS.map((option) => (
            <Link key={option.value} to="/finance/sales/$documentType/new" params={{ documentType: option.value }}>
              <Button type={option.value === 'SALES_INVOICE' ? 'primary' : 'default'} icon={<Plus size={16} />}>
                {option.label}
              </Button>
            </Link>
          ))}
        </Space>
      </div>

      <Card size="small">
        <div className="flex flex-col md:flex-row gap-3">
          <Input
            allowClear
            placeholder="Cari nomor, customer, project, department"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
          />
          <Select
            className="md:w-56"
            value={typeFilter}
            onChange={setTypeFilter}
            options={[
              { value: 'ALL', label: 'Semua tipe' },
              ...SALES_DOCUMENT_TYPE_OPTIONS,
            ]}
          />
        </div>
      </Card>

      <Table
        rowKey="id"
        columns={columns}
        dataSource={filteredDocuments}
        scroll={{ x: true }}
      />
    </div>
  );
}
