import { useState } from 'react';
import { App, Card, Button, DatePicker, Space, Table, Statistic, Empty, Tag, Select } from 'antd';
import { FileTextOutlined, FilterOutlined } from '@ant-design/icons';
import dayjs from '@/lib/dayjs';
import { usePurchaseReport } from '@/hooks/useReports';
import { useI18n } from '@/hooks/useI18n';
import { formatCurrency } from '@/utils/formatters';
import { Loading } from '@/components/Loading';
import { exportCsv, type ExportTarget } from '@/utils/export';
import ExportActions from '@/components/ExportActions';
// import { Loading } from './Loading';

export default function PurchaseReport() {
  const { message } = App.useApp();
  const { t } = useI18n();
  const [startDate, setStartDate] = useState<string | undefined>(dayjs.tz().format('YYYY-MM-DD'));
  const [endDate, setEndDate] = useState<string | undefined>(dayjs.tz().format('YYYY-MM-DD'));
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(null);
  const [selectedHelper, setSelectedHelper] = useState<string | undefined>('today');

  const { data, isLoading, error } = usePurchaseReport(startDate, endDate);

  const handleDateRangeChange = (dates: [dayjs.Dayjs | null, dayjs.Dayjs | null] | null) => {
    setDateRange(dates);
    if (selectedHelper !== 'custom') {
      setSelectedHelper(undefined);
    }
    if (dates && dates[0] && dates[1]) {
      setStartDate(dates[0].format('YYYY-MM-DD'));
      setEndDate(dates[1].format('YYYY-MM-DD'));
    } else {
      setStartDate(undefined);
      setEndDate(undefined);
    }
  };

  const handleHelperChange = (value: string) => {
    setSelectedHelper(value);
    let range: [dayjs.Dayjs, dayjs.Dayjs] | null = null;

    switch (value) {
      case 'today':
        range = [dayjs.tz().startOf('day'), dayjs.tz().endOf('day')];
        break;
      case 'yesterday':
        range = [dayjs.tz().subtract(1, 'day').startOf('day'), dayjs.tz().subtract(1, 'day').endOf('day')];
        break;
      case 'this-week':
        range = [dayjs.tz().startOf('week'), dayjs.tz().endOf('week')];
        break;
      case 'last-week':
        range = [dayjs.tz().subtract(1, 'week').startOf('week'), dayjs.tz().subtract(1, 'week').endOf('week')];
        break;
      case 'this-month':
        range = [dayjs.tz().startOf('month'), dayjs.tz().endOf('month')];
        break;
      case 'last-month':
        range = [dayjs.tz().subtract(1, 'month').startOf('month'), dayjs.tz().subtract(1, 'month').endOf('month')];
        break;
      case 'custom':
        // Don't set range, let the user pick from DatePicker
        return;
      default:
        range = null;
    }

    if (range) {
      setDateRange(range);
      setStartDate(range[0].format('YYYY-MM-DD'));
      setEndDate(range[1].format('YYYY-MM-DD'));
    } else {
      setDateRange(null);
      setStartDate(undefined);
      setEndDate(undefined);
    }
  };

  const handleReset = () => {
    setDateRange(null);
    setStartDate(undefined);
    setEndDate(undefined);
    setSelectedHelper(undefined);
  };

  const handleDownload = async (target: ExportTarget = 'auto') => {
    if (!data) return;

    try {
      const exported = await exportCsv({
        filename: `laporan-pembelian-${dayjs().tz().format('YYYY-MM-DD')}.csv`,
        target,
        rows: [
          [t('report.purchase.title'), dayjs().tz().format('YYYY-MM-DD HH:mm:ss')],
          [`${t('report.periodWithColon')} ${startDate || t('report.allPeriod')} s/d ${endDate || t('report.allPeriod')}`],
          [],
          [t('report.productName'), 'SKU', t('report.date'), t('report.qty'), t('report.unitPrice'), t('report.totalCost')],
          ...data.purchases.map((purchase) => [
            purchase.product_name,
            purchase.sku,
            dayjs(purchase.created_at).tz().format('YYYY-MM-DD HH:mm:ss'),
            purchase.quantity,
            purchase.cost_per_unit,
            purchase.total_cost,
          ]),
          [],
          [t('report.summary')],
          [t('report.totalItemsBought'), data.totalQuantity],
          [t('report.totalCost'), data.totalCost],
          [t('report.averageUnitPrice'), data.averageCostPerUnit],
          [t('report.uniqueProducts'), data.uniqueProducts],
        ],
      });
      if (!exported) return;
      message.success(t('report.purchase.exportSuccess'));
    } catch (error) {
      console.error('Failed to export purchase report:', error);
      message.error(t('report.purchase.exportFailed'));
    }
  };

  const columns = [
    {
      title: t('report.productName'),
      dataIndex: 'product_name',
      key: 'product_name',
      width: 150,
    },
    {
      title: 'SKU',
      dataIndex: 'sku',
      key: 'sku',
      width: 120,
      render: (sku: string) => <Tag>{sku || '-'}</Tag>,
    },
    {
      title: t('report.date'),
      dataIndex: 'created_at',
      key: 'created_at',
      width: 180,
      render: (date: string) => dayjs(date).tz().format('YYYY-MM-DD HH:mm'),
    },
    {
      title: 'Qty',
      dataIndex: 'quantity',
      key: 'quantity',
      width: 80,
      render: (qty: number) => <Tag color="blue">{qty}</Tag>,
    },
    {
      title: t('report.unitPrice'),
      dataIndex: 'cost_per_unit',
      key: 'cost_per_unit',
      width: 120,
      render: (price: number) => formatCurrency(price),
    },
    {
      title: t('report.totalCost'),
      dataIndex: 'total_cost',
      key: 'total_cost',
      width: 130,
      render: (amount: number) => <span className="font-semibold text-blue-600">{formatCurrency(amount)}</span>,
    },
  ];

  if (isLoading) {
    return <Loading />;
  }

  if (error) {
    return (
      <div className="p-6">
        <Empty
          description={t('report.withDateError', { message: error instanceof Error ? error.message : t('common.unknownError') })}
        />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6">
      <h2 className="text-2xl font-bold text-gray-800 mb-6">{t('report.purchase.title')}</h2>

      {/* Filter Section */}
      <Card className="mb-6">
        <Space orientation="vertical" className="w-full" size="large">
          <Space wrap>
            <FilterOutlined className="text-gray-600" />
            <span className="font-semibold">{t('report.dateFilter')}</span>
            <Select
              placeholder={t('report.periodPlaceholder')}
              style={{ width: 150 }}
              value={selectedHelper}
              onChange={handleHelperChange}
              allowClear
              options={[
                { value: 'today', label: t('report.todayTitle') },
                { value: 'yesterday', label: t('report.yesterday') },
                { value: 'this-week', label: t('report.thisWeekTitle') },
                { value: 'last-week', label: t('report.lastWeekTitle') },
                { value: 'this-month', label: t('report.thisMonthTitle') },
                { value: 'last-month', label: t('report.lastMonthTitle') },
                { value: 'custom', label: t('report.customRange') },
              ]}
            />
            {selectedHelper === 'custom' && (
              <DatePicker.RangePicker
                value={dateRange}
                onChange={handleDateRangeChange}
                format="YYYY-MM-DD"
                placeholder={[t('common.from'), t('common.to')]}
              />
            )}
            <Button onClick={handleReset}>{t('common.reset')}</Button>
            <ExportActions
              disabled={!data || data.purchases.length === 0}
              formats={[
                {
                  key: 'csv',
                  label: 'CSV',
                  icon: <FileTextOutlined />,
                  onExport: handleDownload,
                },
              ]}
            />
          </Space>
        </Space>
      </Card>

      {/* Summary Statistics */}
      {data && data.purchases.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
          <Card>
            <Statistic
              title={t('report.totalItemsBought')}
              value={data.totalQuantity}
              suffix={t('report.itemSuffix')}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
          <Card>
            <Statistic
              title={t('report.totalCost')}
              value={data.totalCost}
              prefix="Rp "
              precision={2}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
          <Card>
            <Statistic
              title={t('report.averageUnitPrice')}
              value={data.averageCostPerUnit}
              prefix="Rp "
              precision={2}
              valueStyle={{ color: '#faad14' }}
            />
          </Card>
          <Card>
            <Statistic
              title={t('report.uniqueProducts')}
              value={data.uniqueProducts}
              suffix={t('report.productSuffix')}
              valueStyle={{ color: '#722ed1' }}
            />
          </Card>
          <Card>
            <Statistic
              title={t('report.totalPurchase')}
              value={data.purchases.length}
              suffix={t('report.timesSuffix')}
              valueStyle={{ color: '#eb2f96' }}
            />
          </Card>
        </div>
      )}

      {/* Purchases Table */}
      {data && data.purchases.length > 0 ? (
        <Card>
          <Table
            columns={columns}
            dataSource={data.purchases.map((purchase) => ({
              ...purchase,
              key: purchase.id,
            }))}
            pagination={{
              pageSize: 10,
              showSizeChanger: true,
              showTotal: (total) => `${t('common.total')} ${total} ${t('report.purchaseCount')}`,
            }}
            scroll={{ x: 768 }}
          />
        </Card>
      ) : (
        <Empty description={t('report.noPurchasesForPeriod')} />
      )}
    </div>
  );
}
