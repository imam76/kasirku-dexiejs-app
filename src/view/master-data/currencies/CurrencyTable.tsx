import { Button, Space, Table, Tag, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { Archive, Edit2, RefreshCw, RotateCcw } from 'lucide-react';
import { useI18n } from '@/hooks/useI18n';
import type { Currency, CurrencyRate } from '@/types';
import { formatCurrency } from '@/utils/formatters';

const { Text } = Typography;

interface CurrencyTableProps {
  currencies: Currency[];
  latestRateByCurrency: Record<string, CurrencyRate>;
  onEdit: (currency: Currency) => void;
  onOpenRate: (currency: Currency) => void;
  onArchive: (currency: Currency) => void;
  onRestore: (currency: Currency) => void;
}

export default function CurrencyTable({
  currencies,
  latestRateByCurrency,
  onEdit,
  onOpenRate,
  onArchive,
  onRestore,
}: CurrencyTableProps) {
  const { t } = useI18n();

  const columns: ColumnsType<Currency> = [
    {
      title: t('currencies.table.currency'),
      dataIndex: 'code',
      key: 'code',
      render: (_value: string, currency) => (
        <Space orientation="vertical" size={0}>
          <Space size={6}>
            <Text strong>{currency.code}</Text>
            {currency.is_base ? <Tag color="blue">{t('currencies.base')}</Tag> : null}
          </Space>
          <Text type="secondary">{currency.name}</Text>
        </Space>
      ),
    },
    {
      title: t('currencies.table.symbol'),
      dataIndex: 'symbol',
      key: 'symbol',
      render: (symbol?: string) => symbol || '-',
    },
    {
      title: t('currencies.table.latestRate'),
      key: 'latestRate',
      render: (_value: unknown, currency) => {
        const rate = latestRateByCurrency[currency.code];
        if (!rate) return '-';

        return (
          <Space orientation="vertical" size={0}>
            <Text>{currency.code === 'IDR' ? '1' : `Rp ${formatCurrency(rate.middle_rate)}`}</Text>
            <Text type="secondary" className="text-xs">
              {rate.rate_date} - {t(`currencies.source.${rate.source}`)}
            </Text>
          </Space>
        );
      },
    },
    {
      title: t('currencies.table.status'),
      dataIndex: 'is_active',
      key: 'is_active',
      render: (isActive: boolean) => (
        <Tag color={isActive ? 'green' : 'default'}>
          {isActive ? t('currencies.status.active') : t('currencies.status.inactive')}
        </Tag>
      ),
    },
    {
      title: t('currencies.table.action'),
      key: 'action',
      render: (_value: unknown, currency) => (
        <Space wrap>
          <Tooltip title={t('currencies.rate')}>
            <Button type="text" icon={<RefreshCw size={16} />} onClick={() => onOpenRate(currency)}>
              {t('currencies.rate')}
            </Button>
          </Tooltip>
          <Button type="text" icon={<Edit2 size={16} />} onClick={() => onEdit(currency)}>
            {t('currencies.edit')}
          </Button>
          {currency.is_active ? (
            <Button
              danger
              type="text"
              icon={<Archive size={16} />}
              disabled={currency.is_base}
              onClick={() => onArchive(currency)}
            >
              {t('currencies.archive')}
            </Button>
          ) : (
            <Button type="text" icon={<RotateCcw size={16} />} onClick={() => onRestore(currency)}>
              {t('currencies.restore')}
            </Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <Table
      dataSource={currencies}
      columns={columns}
      rowKey="id"
      pagination={{ pageSize: 8 }}
      scroll={{ x: true }}
      locale={{ emptyText: t('currencies.empty') }}
    />
  );
}
