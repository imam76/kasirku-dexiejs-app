import { Button, Progress, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { Archive, Edit2, ListChecks, RotateCcw } from 'lucide-react';
import { getFinanceCategoryLabel } from '@/i18n/finance';
import { useI18n } from '@/hooks/useI18n';
import type { Budget } from '@/types';
import type { BudgetRealization } from '@/services/budgetRealizationService';
import { formatCurrency } from '@/utils/formatters';
import {
  BUDGET_STATUS_COLOR,
  BUDGET_STATUS_LABEL_KEY,
  PROJECTED_BUDGET_STATUS_LABEL_KEY,
  formatBudgetPeriodLabel,
} from './budgetFormatters';

const { Text } = Typography;

interface BudgetTableProps {
  budgetsWithRealization: BudgetRealization[];
  loading?: boolean;
  onEdit: (budget: Budget) => void;
  onArchive: (budget: Budget) => void;
  onRestore: (budget: Budget) => void;
  onViewCommitments: (budget: Budget) => void;
}

export default function BudgetTable({
  budgetsWithRealization,
  loading = false,
  onEdit,
  onArchive,
  onRestore,
  onViewCommitments,
}: BudgetTableProps) {
  const { t } = useI18n();

  const columns: ColumnsType<BudgetRealization> = [
    {
      title: t('budget.table.name'),
      key: 'name',
      render: (_value, realization) => (
        <Space orientation="vertical" size={0}>
          <Text strong>{realization.budget.name}</Text>
          <Text type="secondary">{getFinanceCategoryLabel(realization.budget.category, t)}</Text>
        </Space>
      ),
    },
    {
      title: t('budget.table.type'),
      key: 'type',
      render: (_value, realization) => (
        <Tag color={realization.budget.budget_type === 'EXPENSE' ? 'red' : 'green'}>
          {realization.budget.budget_type === 'EXPENSE' ? t('budget.type.expense') : t('budget.type.income')}
        </Tag>
      ),
    },
    {
      title: t('budget.table.period'),
      key: 'period',
      render: (_value, realization) => formatBudgetPeriodLabel(realization.budget),
    },
    {
      title: t('budget.table.planned'),
      key: 'planned',
      align: 'right',
      render: (_value, realization) => `Rp ${formatCurrency(realization.budget.planned_amount)}`,
    },
    {
      title: t('budget.table.actual'),
      key: 'actual',
      align: 'right',
      render: (_value, realization) => `Rp ${formatCurrency(realization.actual_amount)}`,
    },
    {
      title: t('budget.table.remaining'),
      key: 'remaining',
      align: 'right',
      render: (_value, realization) => (
        <Text type={realization.remaining_amount < 0 ? 'danger' : undefined}>
          {`Rp ${formatCurrency(realization.remaining_amount)}`}
        </Text>
      ),
    },
    {
      title: t('budget.table.progress'),
      key: 'progress',
      width: 180,
      render: (_value, realization) => (
        <Progress
          percent={Math.min(Math.round(realization.usage_percent), 100)}
          status={realization.status === 'OVER' ? 'exception' : 'normal'}
          strokeColor={realization.status === 'WARNING' ? '#faad14' : undefined}
        />
      ),
    },
    {
      title: t('budget.table.status'),
      key: 'status',
      render: (_value, realization) => (
        <Space orientation="vertical" size={4}>
          <Tag color={BUDGET_STATUS_COLOR[realization.status]}>
            {t(BUDGET_STATUS_LABEL_KEY[realization.status])}
          </Tag>
          {realization.committed_amount > 0 ? (
            <Tag color={BUDGET_STATUS_COLOR[realization.projected_status]}>
              {t('budget.projectedStatus.badge', { status: t(PROJECTED_BUDGET_STATUS_LABEL_KEY[realization.projected_status]) })}
            </Tag>
          ) : null}
        </Space>
      ),
    },
    {
      title: t('budget.table.action'),
      key: 'action',
      render: (_value, realization) => (
        <Space wrap>
          <Button type="text" icon={<Edit2 size={16} />} onClick={() => onEdit(realization.budget)}>
            {t('budget.edit')}
          </Button>
          <Button type="text" icon={<ListChecks size={16} />} onClick={() => onViewCommitments(realization.budget)}>
            {t('budget.commitment.view')}
          </Button>
          {realization.budget.is_active ? (
            <Button danger type="text" icon={<Archive size={16} />} onClick={() => onArchive(realization.budget)}>
              {t('budget.archive')}
            </Button>
          ) : (
            <Button type="text" icon={<RotateCcw size={16} />} onClick={() => onRestore(realization.budget)}>
              {t('budget.restore')}
            </Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <Table
      dataSource={budgetsWithRealization}
      columns={columns}
      loading={loading}
      rowKey={(realization) => realization.budget.id}
      pagination={{ pageSize: 10 }}
      scroll={{ x: true }}
      locale={{ emptyText: t('budget.empty') }}
    />
  );
}
