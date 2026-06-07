import { useMemo, useState } from 'react';
import { Button, Card, Input, Select, Table, Tag, Typography } from 'antd';
import { Link } from '@tanstack/react-router';
import { ArrowLeft, Eye, Plus, RotateCcw } from 'lucide-react';
import type { ColumnsType } from 'antd/es/table';
import { useI18n } from '@/hooks/useI18n';
import { useSalesReturns } from '@/hooks/useSalesReturns';
import type { SalesReturn, SalesReturnResolution, SalesReturnStatus } from '@/types';
import { formatCurrency, formatDate } from '@/utils/formatters';

const { Title, Text } = Typography;

const statusColor: Record<SalesReturnStatus, string> = {
  DRAFT: 'default',
  ISSUED: 'blue',
  VOIDED: 'red',
};

const resolutionColor: Record<SalesReturnResolution, string> = {
  NO_FINANCE: 'default',
  CREDIT_NOTE: 'gold',
  REFUND: 'red',
};

const statusLabelKey: Record<SalesReturnStatus, 'salesReturns.status.draft' | 'salesReturns.status.issued' | 'salesReturns.status.voided'> = {
  DRAFT: 'salesReturns.status.draft',
  ISSUED: 'salesReturns.status.issued',
  VOIDED: 'salesReturns.status.voided',
};

const resolutionLabelKey: Record<SalesReturnResolution, 'salesReturns.resolution.noFinance' | 'salesReturns.resolution.creditNote' | 'salesReturns.resolution.refund'> = {
  NO_FINANCE: 'salesReturns.resolution.noFinance',
  CREDIT_NOTE: 'salesReturns.resolution.creditNote',
  REFUND: 'salesReturns.resolution.refund',
};

export default function SalesReturnsManagement() {
  const { t } = useI18n();
  const { salesReturns } = useSalesReturns();
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState<SalesReturnStatus | 'ALL'>('ALL');

  const filteredReturns = useMemo(() => {
    const query = searchText.trim().toLowerCase();

    return salesReturns.filter((salesReturn) => {
      const matchesStatus = statusFilter === 'ALL' || salesReturn.status === statusFilter;
      const matchesSearch = !query || [
        salesReturn.return_number,
        salesReturn.source_number,
        salesReturn.customer_name,
      ].some((value) => value?.toLowerCase().includes(query));

      return matchesStatus && matchesSearch;
    });
  }, [salesReturns, searchText, statusFilter]);

  const columns: ColumnsType<SalesReturn> = [
    {
      title: t('salesReturns.field.returnNumber'),
      dataIndex: 'return_number',
      render: (value: string, record) => (
        <Link to="/sales/returns/$returnId" params={{ returnId: record.id }}>
          {value}
        </Link>
      ),
    },
    {
      title: t('salesReturns.field.source'),
      dataIndex: 'source_number',
    },
    {
      title: t('salesReturns.field.customer'),
      dataIndex: 'customer_name',
    },
    {
      title: t('salesReturns.field.documentDate'),
      dataIndex: 'document_date',
      width: 130,
      render: (value: string) => formatDate(value),
    },
    {
      title: t('salesReturns.field.status'),
      dataIndex: 'status',
      width: 120,
      render: (value: SalesReturnStatus) => <Tag color={statusColor[value]}>{t(statusLabelKey[value])}</Tag>,
    },
    {
      title: t('salesReturns.field.resolution'),
      dataIndex: 'resolution',
      width: 150,
      render: (value: SalesReturnResolution) => <Tag color={resolutionColor[value]}>{t(resolutionLabelKey[value])}</Tag>,
    },
    {
      title: t('salesReturns.field.total'),
      dataIndex: 'total_amount',
      align: 'right',
      width: 150,
      render: (value: number) => `Rp ${formatCurrency(value || 0)}`,
    },
    {
      title: '',
      key: 'action',
      fixed: 'right',
      width: 110,
      render: (_, record) => (
        <Link to="/sales/returns/$returnId" params={{ returnId: record.id }}>
          <Button size="small" icon={<Eye size={14} />}>
            {t('salesReturns.detail')}
          </Button>
        </Link>
      ),
    },
  ];

  return (
    <div className="p-3 sm:p-4 md:p-6 space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <Title level={2} style={{ margin: 0 }}>{t('salesReturns.title')}</Title>
          <Text type="secondary">{t('salesReturns.subtitle')}</Text>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/sales">
            <Button icon={<ArrowLeft size={16} />}>{t('salesDocuments.backToSalesMenu')}</Button>
          </Link>
          <Link to="/sales/returns/new">
            <Button type="primary" icon={<Plus size={16} />}>{t('salesReturns.new')}</Button>
          </Link>
        </div>
      </div>

      <Card size="small">
        <div className="grid gap-2 md:grid-cols-[1fr_220px]">
          <Input
            allowClear
            prefix={<RotateCcw size={14} />}
            placeholder={t('salesReturns.searchPlaceholder')}
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
          />
          <Select
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { value: 'ALL', label: t('salesReturns.status.all') },
              { value: 'DRAFT', label: t('salesReturns.status.draft') },
              { value: 'ISSUED', label: t('salesReturns.status.issued') },
              { value: 'VOIDED', label: t('salesReturns.status.voided') },
            ]}
          />
        </div>
      </Card>

      <Table
        rowKey="id"
        columns={columns}
        dataSource={filteredReturns}
        scroll={{ x: true }}
      />
    </div>
  );
}
