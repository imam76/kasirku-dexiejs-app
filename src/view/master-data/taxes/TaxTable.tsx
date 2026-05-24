import { Button, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { Archive, CheckCircle2, Edit2, RotateCcw } from 'lucide-react';
import { useI18n } from '@/hooks/useI18n';
import type { Tax, TaxCalculationMode } from '@/types';
import { getTaxPeriodLabel } from './taxFormatters';
import { taxCalculationModeOptions } from './taxOptions';

const { Text } = Typography;

interface TaxTableProps {
  taxes: Tax[];
  onEdit: (tax: Tax) => void;
  onArchive: (tax: Tax) => void;
  onRestore: (tax: Tax) => void;
  onSetDefault: (tax: Tax) => void;
}

export default function TaxTable({ taxes, onEdit, onArchive, onRestore, onSetDefault }: TaxTableProps) {
  const { t } = useI18n();
  const modeLabelMap = taxCalculationModeOptions.reduce<Record<TaxCalculationMode, string>>((acc, option) => {
    acc[option.value] = t(option.labelKey);
    return acc;
  }, {} as Record<TaxCalculationMode, string>);

  const columns: ColumnsType<Tax> = [
    {
      title: t('taxes.table.name'),
      dataIndex: 'name',
      key: 'name',
      render: (name: string, tax) => (
        <Space direction="vertical" size={0}>
          <Text strong>{name}</Text>
          {tax.code && <Text type="secondary">{tax.code}</Text>}
        </Space>
      ),
    },
    {
      title: t('taxes.table.rate'),
      dataIndex: 'rate',
      key: 'rate',
      render: (rate: number) => `${rate}%`,
    },
    {
      title: t('taxes.table.mode'),
      dataIndex: 'calculation_mode',
      key: 'calculation_mode',
      render: (mode: TaxCalculationMode) => {
        const option = taxCalculationModeOptions.find((item) => item.value === mode);
        return <Tag color={option?.color}>{modeLabelMap[mode]}</Tag>;
      },
    },
    {
      title: t('taxes.table.default'),
      dataIndex: 'is_default',
      key: 'is_default',
      render: (isDefault: boolean) => isDefault ? <Tag color="gold">{t('taxes.default.yes')}</Tag> : '-',
    },
    {
      title: t('taxes.table.period'),
      key: 'period',
      render: (_value: unknown, tax) => getTaxPeriodLabel(tax),
    },
    {
      title: t('taxes.table.status'),
      dataIndex: 'is_active',
      key: 'is_active',
      render: (isActive: boolean) => (
        <Tag color={isActive ? 'green' : 'default'}>
          {isActive ? t('taxes.status.active') : t('taxes.status.inactive')}
        </Tag>
      ),
    },
    {
      title: t('taxes.table.action'),
      key: 'action',
      render: (_value: unknown, tax) => (
        <Space wrap>
          <Button type="text" icon={<Edit2 size={16} />} onClick={() => onEdit(tax)}>
            {t('taxes.edit')}
          </Button>
          {tax.is_active && !tax.is_default && (
            <Button type="text" icon={<CheckCircle2 size={16} />} onClick={() => onSetDefault(tax)}>
              {t('taxes.setDefault')}
            </Button>
          )}
          {tax.is_active ? (
            <Button danger type="text" icon={<Archive size={16} />} onClick={() => onArchive(tax)}>
              {t('taxes.archive')}
            </Button>
          ) : (
            <Button type="text" icon={<RotateCcw size={16} />} onClick={() => onRestore(tax)}>
              {t('taxes.restore')}
            </Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <Table
      dataSource={taxes}
      columns={columns}
      rowKey="id"
      pagination={{ pageSize: 8 }}
      scroll={{ x: true }}
      locale={{ emptyText: t('taxes.empty') }}
    />
  );
}
