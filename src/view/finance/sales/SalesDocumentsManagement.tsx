import { useMemo, useState } from 'react';
import { Button, Card, Input, Select, Space, Table, Tag, Typography } from 'antd';
import { Link } from '@tanstack/react-router';
import { Eye, Plus } from 'lucide-react';
import type { ColumnsType } from 'antd/es/table';
import { getSalesDocumentConfig, SALES_DOCUMENT_TYPE_OPTIONS } from '@/configs/sales-document';
import { useI18n } from '@/hooks/useI18n';
import { useSalesDocuments } from '@/hooks/useSalesDocuments';
import type { SalesDocument, SalesDocumentStatus, SalesDocumentType } from '@/types';
import { formatCurrency, formatDate } from '@/utils/formatters';
import { salesDocumentStatusLabelKeys, salesInvoicePaymentStatusLabelKeys } from '@/utils/salesDocuments/i18n';

const { Title, Text } = Typography;

const statusColor: Record<SalesDocumentStatus, string> = {
  DRAFT: 'default',
  ISSUED: 'blue',
  CONVERTED: 'green',
  VOIDED: 'red',
};

const hasPaymentStatus = (document: Pick<SalesDocument, 'type'>) => (
  getSalesDocumentConfig(document.type).behavior.hasPaymentStatus
);

const hasPricing = (document: Pick<SalesDocument, 'type'>) => (
  getSalesDocumentConfig(document.type).behavior.hasPricing
);

export default function SalesDocumentsManagement() {
  const { t } = useI18n();
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

  const showPaymentColumn = typeFilter === 'ALL'
    ? filteredDocuments.some(hasPaymentStatus)
    : getSalesDocumentConfig(typeFilter).behavior.hasPaymentStatus;
  const showTotalColumn = typeFilter === 'ALL'
    ? filteredDocuments.some(hasPricing)
    : getSalesDocumentConfig(typeFilter).behavior.hasPricing;

  const columns: ColumnsType<SalesDocument> = [
    {
      title: t('salesDocuments.table.documentNumber'),
      dataIndex: 'document_number',
      render: (value: string, record) => (
        <Link to="/finance/sales/$documentType/$documentId" params={{ documentType: record.type, documentId: record.id }}>
          {value}
        </Link>
      ),
    },
    {
      title: t('salesDocuments.table.type'),
      dataIndex: 'type',
      render: (value: SalesDocumentType) => t(
        SALES_DOCUMENT_TYPE_OPTIONS.find((option) => option.value === value)?.labelKey ?? 'salesDocuments.table.type',
      ),
      width: 150,
    },
    {
      title: t('salesDocuments.table.customer'),
      dataIndex: 'customer_name',
    },
    {
      title: t('salesDocuments.table.date'),
      dataIndex: 'document_date',
      render: (value: string) => formatDate(value),
      width: 130,
    },
    {
      title: t('salesDocuments.table.status'),
      dataIndex: 'status',
      render: (value: SalesDocumentStatus) => <Tag color={statusColor[value]}>{t(salesDocumentStatusLabelKeys[value])}</Tag>,
      width: 120,
    },
    ...(showPaymentColumn ? [{
      title: t('salesDocuments.table.payment'),
      dataIndex: 'payment_status',
      render: (value: SalesDocument['payment_status'], record: SalesDocument) => (
        hasPaymentStatus(record) && value ? <Tag>{t(salesInvoicePaymentStatusLabelKeys[value])}</Tag> : '-'
      ),
      width: 110,
    }] : []),
    ...(showTotalColumn ? [{
      title: t('salesDocuments.table.total'),
      dataIndex: 'total_amount',
      align: 'right' as const,
      render: (value: number | undefined, record: SalesDocument) => (
        hasPricing(record) && value !== undefined ? `Rp ${formatCurrency(value)}` : '-'
      ),
      width: 150,
    }] : []),
    {
      title: '',
      key: 'action',
      fixed: 'right',
      width: 110,
      render: (_, record) => (
        <Link to="/finance/sales/$documentType/$documentId" params={{ documentType: record.type, documentId: record.id }}>
          <Button size="small" icon={<Eye size={14} />}>
            {t('salesDocuments.detail')}
          </Button>
        </Link>
      ),
    },
  ];

  return (
    <div className="p-3 sm:p-4 md:p-6 space-y-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <Title level={2} style={{ margin: 0 }}>{t('salesDocuments.title')}</Title>
          <Text type="secondary">{t('salesDocuments.subtitle')}</Text>
        </div>
        <Space wrap>
          {SALES_DOCUMENT_TYPE_OPTIONS.map((option) => (
            <Link key={option.value} to="/finance/sales/$documentType/new" params={{ documentType: option.value }}>
              <Button type={option.value === 'SALES_INVOICE' ? 'primary' : 'default'} icon={<Plus size={16} />}>
                {t(option.labelKey)}
              </Button>
            </Link>
          ))}
        </Space>
      </div>

      <Card size="small">
        <div className="flex flex-col md:flex-row gap-3">
          <Input
            allowClear
            placeholder={t('salesDocuments.searchPlaceholder')}
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
          />
          <Select
            className="md:w-56"
            value={typeFilter}
            onChange={setTypeFilter}
            options={[
              { value: 'ALL', label: t('salesDocuments.allTypes') },
              ...SALES_DOCUMENT_TYPE_OPTIONS.map((option) => ({
                value: option.value,
                label: t(option.labelKey),
              })),
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
