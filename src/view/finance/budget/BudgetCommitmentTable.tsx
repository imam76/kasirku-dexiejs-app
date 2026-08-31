import { Button, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { CheckCircle2, Edit2, Trash2, XCircle } from 'lucide-react';
import dayjs from '@/lib/dayjs';
import { useI18n } from '@/hooks/useI18n';
import type { BudgetCommitment } from '@/types';
import { formatCurrency } from '@/utils/formatters';
import { BUDGET_COMMITMENT_STATUS_COLOR, BUDGET_COMMITMENT_STATUS_LABEL_KEY } from './budgetFormatters';

const { Text } = Typography;

interface BudgetCommitmentTableProps {
  commitments: BudgetCommitment[];
  loading?: boolean;
  onEdit: (commitment: BudgetCommitment) => void;
  onMarkRealized: (commitment: BudgetCommitment) => void;
  onCancel: (commitment: BudgetCommitment) => void;
  onDelete: (commitment: BudgetCommitment) => void;
}

export default function BudgetCommitmentTable({
  commitments,
  loading = false,
  onEdit,
  onMarkRealized,
  onCancel,
  onDelete,
}: BudgetCommitmentTableProps) {
  const { t } = useI18n();

  const columns: ColumnsType<BudgetCommitment> = [
    {
      title: t('budget.commitment.description'),
      key: 'description',
      render: (_value, commitment) => (
        <Space orientation="vertical" size={0}>
          <Text strong>{commitment.description}</Text>
          {commitment.notes ? <Text type="secondary">{commitment.notes}</Text> : null}
        </Space>
      ),
    },
    {
      title: t('budget.commitment.amount'),
      key: 'amount',
      align: 'right',
      render: (_value, commitment) => `Rp ${formatCurrency(commitment.amount)}`,
    },
    {
      title: t('budget.table.status'),
      key: 'status',
      render: (_value, commitment) => (
        <Tag color={BUDGET_COMMITMENT_STATUS_COLOR[commitment.status]}>
          {t(BUDGET_COMMITMENT_STATUS_LABEL_KEY[commitment.status])}
        </Tag>
      ),
    },
    {
      title: t('budget.commitment.resolvedAt'),
      key: 'resolvedAt',
      render: (_value, commitment) => (commitment.resolved_at ? dayjs(commitment.resolved_at).format('DD MMM YYYY') : '-'),
    },
    {
      title: t('budget.table.action'),
      key: 'action',
      render: (_value, commitment) => (
        <Space wrap>
          <Button type="text" icon={<Edit2 size={16} />} onClick={() => onEdit(commitment)}>
            {t('budget.commitment.edit')}
          </Button>
          {commitment.status === 'PLANNED' ? (
            <>
              <Button type="text" icon={<CheckCircle2 size={16} />} onClick={() => onMarkRealized(commitment)}>
                {t('budget.commitment.markRealized')}
              </Button>
              <Button type="text" icon={<XCircle size={16} />} onClick={() => onCancel(commitment)}>
                {t('budget.commitment.cancel')}
              </Button>
            </>
          ) : null}
          <Button danger type="text" icon={<Trash2 size={16} />} onClick={() => onDelete(commitment)}>
            {t('budget.commitment.delete')}
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <Table
      dataSource={commitments}
      columns={columns}
      loading={loading}
      rowKey={(commitment) => commitment.id}
      pagination={{ pageSize: 10 }}
      scroll={{ x: true }}
      locale={{ emptyText: t('budget.commitment.empty') }}
    />
  );
}
