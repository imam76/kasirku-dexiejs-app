import { useMemo, useState } from 'react';
import { App, Button, Card, DatePicker, Input, Select, Space, Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { ClipboardCheck, Edit, Eye, Plus, RefreshCw } from 'lucide-react';
import StockOpnameCreateModal from '@/components/stock-opname/StockOpnameCreateModal';
import StockOpnameStatusBadge from '@/components/stock-opname/StockOpnameStatusBadge';
import { useI18n } from '@/hooks/useI18n';
import { useStockOpnames } from '@/hooks/useStockOpnames';
import dayjs from '@/lib/dayjs';
import type { CreateStockOpnameDraftInput } from '@/services/stockOpnameService';
import type { StockOpname, StockOpnameStatus } from '@/types';
import { formatCurrency } from '@/utils/formatters';
import StockOpnameDetail from './StockOpnameDetail';
import StockOpnameEditor from './StockOpnameEditor';

const { Title } = Typography;

type ScreenState =
  | { type: 'list' }
  | { type: 'editor'; opnameId: string }
  | { type: 'detail'; opnameId: string };

type OpnameDocumentScreenType = Extract<ScreenState, { opnameId: string }>['type'];
type StatusFilter = StockOpnameStatus | 'ALL';

export default function StockOpnameManagement() {
  const { t } = useI18n();
  const { message } = App.useApp();
  const [screen, setScreen] = useState<ScreenState>({ type: 'list' });
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>([
    dayjs().startOf('month'),
    dayjs().endOf('month'),
  ]);

  const filters = useMemo(() => ({
    searchText,
    status: statusFilter,
    startDate: dateRange?.[0].startOf('day').toISOString(),
    endDate: dateRange?.[1].endOf('day').toISOString(),
  }), [dateRange, searchText, statusFilter]);

  const {
    opnames,
    isLoadingOpnames,
    isFetchingOpnames,
    refetchOpnames,
    createDraft,
    isCreatingDraft,
  } = useStockOpnames({ filters });

  if (screen.type === 'editor') {
    return (
      <StockOpnameEditor
        opnameId={screen.opnameId}
        onBack={() => setScreen({ type: 'list' })}
        onPosted={(opnameId) => setScreen({ type: 'detail', opnameId })}
      />
    );
  }

  if (screen.type === 'detail') {
    return (
      <StockOpnameDetail
        opnameId={screen.opnameId}
        onBack={() => setScreen({ type: 'list' })}
      />
    );
  }

  const handleCreateDraft = async (input: CreateStockOpnameDraftInput) => {
    try {
      const result = await createDraft(input);
      setIsCreateModalOpen(false);
      setScreen({ type: 'editor', opnameId: result.opname.id });
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('stockOpname.createFailed'));
    }
  };

  const getScreenTypeForOpname = (opname: StockOpname): OpnameDocumentScreenType => (
    opname.status === 'DRAFT' || opname.status === 'REVIEWED' ? 'editor' : 'detail'
  );

  const columns: ColumnsType<StockOpname> = [
    {
      title: t('stockOpname.number'),
      dataIndex: 'opname_number',
      key: 'opname_number',
      width: 180,
      render: (value: string, opname) => (
        <Button type="link" className="!px-0" onClick={() => setScreen({
          type: getScreenTypeForOpname(opname),
          opnameId: opname.id,
        })}>
          {value}
        </Button>
      ),
    },
    {
      title: t('stockOpname.status'),
      dataIndex: 'status',
      key: 'status',
      width: 130,
      render: (status: StockOpnameStatus) => <StockOpnameStatusBadge status={status} />,
    },
    {
      title: t('stockOpname.countedAt'),
      dataIndex: 'counted_at',
      key: 'counted_at',
      width: 180,
      render: (value: string) => dayjs(value).tz().format('DD MMM YYYY HH:mm'),
    },
    {
      title: t('stockOpname.totalItems'),
      dataIndex: 'total_items',
      key: 'total_items',
      align: 'right',
      width: 110,
    },
    {
      title: t('stockOpname.adjustmentIn'),
      dataIndex: 'total_adjustment_in',
      key: 'total_adjustment_in',
      align: 'right',
      width: 130,
    },
    {
      title: t('stockOpname.adjustmentOut'),
      dataIndex: 'total_adjustment_out',
      key: 'total_adjustment_out',
      align: 'right',
      width: 130,
    },
    {
      title: t('stockOpname.varianceValue'),
      dataIndex: 'total_variance_value',
      key: 'total_variance_value',
      align: 'right',
      width: 150,
      render: (value: number) => `Rp ${formatCurrency(value || 0)}`,
    },
    {
      title: t('stockOpname.action'),
      key: 'action',
      fixed: 'right',
      width: 130,
      render: (_value, opname) => (
        <Button
          type="text"
          icon={opname.status === 'DRAFT' || opname.status === 'REVIEWED' ? <Edit size={16} /> : <Eye size={16} />}
          onClick={() => setScreen({
            type: getScreenTypeForOpname(opname),
            opnameId: opname.id,
          })}
        >
          {opname.status === 'DRAFT' || opname.status === 'REVIEWED' ? t('stockOpname.edit') : t('stockOpname.view')}
        </Button>
      ),
    },
  ];

  return (
    <Card
      className="rounded-md shadow-md"
      title={(
        <div className="flex items-center gap-2">
          <ClipboardCheck className="h-5 w-5" />
          <Title level={4} className="!mb-0">
            {t('stockOpname.title')}
          </Title>
        </div>
      )}
      extra={(
        <Button type="primary" icon={<Plus size={16} />} loading={isCreatingDraft} onClick={() => setIsCreateModalOpen(true)}>
          {t('stockOpname.create')}
        </Button>
      )}
    >
      <div className="mb-4 grid grid-cols-1 gap-3 lg:grid-cols-[minmax(240px,1fr)_180px_280px_auto]">
        <Input.Search
          allowClear
          value={searchText}
          placeholder={t('stockOpname.searchPlaceholder')}
          onChange={(event) => setSearchText(event.target.value)}
        />
        <Select<StatusFilter>
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { value: 'ALL', label: t('stockOpname.status.ALL') },
            { value: 'DRAFT', label: t('stockOpname.status.DRAFT') },
            { value: 'REVIEWED', label: t('stockOpname.status.REVIEWED') },
            { value: 'POSTED', label: t('stockOpname.status.POSTED') },
            { value: 'CANCELLED', label: t('stockOpname.status.CANCELLED') },
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
        <Space>
          <Button icon={<RefreshCw size={16} />} loading={isFetchingOpnames} onClick={() => refetchOpnames()}>
            {t('stockOpname.refresh')}
          </Button>
        </Space>
      </div>

      <Table
        dataSource={opnames}
        columns={columns}
        rowKey="id"
        loading={isLoadingOpnames}
        scroll={{ x: 1200 }}
        pagination={{ pageSize: 20, showSizeChanger: true }}
      />
      <StockOpnameCreateModal
        open={isCreateModalOpen}
        loading={isCreatingDraft}
        onCancel={() => setIsCreateModalOpen(false)}
        onCreate={handleCreateDraft}
      />
    </Card>
  );
}
