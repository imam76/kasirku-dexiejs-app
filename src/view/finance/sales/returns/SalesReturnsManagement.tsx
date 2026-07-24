import { useMemo, useState } from 'react';
import { Button, DatePicker, Input, Select, Table, Tag } from 'antd';
import { Link } from '@tanstack/react-router';
import { ArrowLeft, Eye, Plus, RotateCcw } from 'lucide-react';
import type { ColumnsType } from 'antd/es/table';
import ManagementListCard from '@/components/ManagementListCard';
import { useI18n } from '@/hooks/useI18n';
import { useSalesReturns } from '@/hooks/useSalesReturns';
import dayjs from '@/lib/dayjs';
import type { SalesReturn, SalesReturnResolution, SalesReturnStatus } from '@/types';
import { formatCurrency, formatDate } from '@/utils/formatters';

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
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null);

  const filteredReturns = useMemo(() => {
    const query = searchText.trim().toLowerCase();

    return salesReturns.filter((salesReturn) => {
      const matchesStatus = statusFilter === 'ALL' || salesReturn.status === statusFilter;
      const matchesSearch = !query || [
        salesReturn.return_number,
        salesReturn.source_number,
        salesReturn.customer_name,
      ].some((value) => value?.toLowerCase().includes(query));
      const returnDate = dayjs(salesReturn.document_date);
      const matchesDate = !dateRange || (
        !returnDate.isBefore(dateRange[0], 'day')
        && !returnDate.isAfter(dateRange[1], 'day')
      );

      return matchesStatus && matchesSearch && matchesDate;
    });
  }, [dateRange, salesReturns, searchText, statusFilter]);

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
      title: t('common.actions'),
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
    <ManagementListCard
      title={t('salesReturns.title')}
      icon={<RotateCcw className="h-5 w-5 text-rose-600" />}
      actions={(
        <div className="flex flex-wrap justify-end gap-2">
          <Link to="/sales">
            <Button icon={<ArrowLeft size={16} />}>{t('salesDocuments.backToSalesMenu')}</Button>
          </Link>
          <Link to="/sales/returns/new">
            <Button type="primary" icon={<Plus size={16} />}>{t('salesReturns.new')}</Button>
          </Link>
        </div>
      )}
      toolbar={(
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(240px,1fr)_180px_280px_auto]">
          <Input.Search
            allowClear
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
          <DatePicker.RangePicker
            value={dateRange}
            allowClear
            format="DD MMM YYYY"
            onChange={(value) => {
              if (value?.[0] && value[1]) {
                setDateRange([value[0], value[1]]);
                return;
              }
              setDateRange(null);
            }}
          />
          <Button
            icon={<RotateCcw size={16} />}
            onClick={() => {
              setSearchText('');
              setStatusFilter('ALL');
              setDateRange(null);
            }}
          >
            {t('common.reset')}
          </Button>
        </div>
      )}
    >
      <Table
        rowKey="id"
        columns={columns}
        dataSource={filteredReturns}
        scroll={{ x: 1100 }}
        pagination={{ pageSize: 20, showSizeChanger: true }}
      />
    </ManagementListCard>
  );
}
