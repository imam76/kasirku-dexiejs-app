import { Button, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { CreditCard, Eye } from 'lucide-react';
import type { HTMLAttributes } from 'react';
import dayjs from '@/lib/dayjs';
import { useI18n } from '@/hooks/useI18n';
import type {
  CooperativeLoan,
  CooperativeLoanInstallment,
  CooperativeLoanInstallmentStatus,
} from '@/types';
import { formatCurrency, formatDate } from '@/utils/formatters';
import { getInstallmentRemainingAmounts } from '@/utils/koperasi/loanPaymentAllocation';
import { cooperativeLoanInstallmentStatusOptions } from '../loans/loanOptions';

const { Text } = Typography;

interface CooperativeBillingTableProps {
  installments: CooperativeLoanInstallment[];
  loanById: Map<string, CooperativeLoan>;
  onPay: (installment: CooperativeLoanInstallment) => void;
  onView: (installment: CooperativeLoanInstallment) => void;
  loading?: boolean;
}

export default function CooperativeBillingTable({
  installments,
  loanById,
  onPay,
  onView,
  loading,
}: CooperativeBillingTableProps) {
  const { t } = useI18n();
  const statusLabels = cooperativeLoanInstallmentStatusOptions.reduce<Record<CooperativeLoanInstallmentStatus, string>>((acc, option) => {
    acc[option.value] = t(option.labelKey);
    return acc;
  }, {} as Record<CooperativeLoanInstallmentStatus, string>);

  const columns: ColumnsType<CooperativeLoanInstallment> = [
    {
      title: t('cooperative.billing.table.dueDate'),
      dataIndex: 'due_date',
      key: 'due_date',
      width: 150,
      render: (value: string) => {
        const isOverdue = dayjs(value).isBefore(dayjs().startOf('day'));
        return <Text type={isOverdue ? 'danger' : undefined}>{formatDate(value)}</Text>;
      },
    },
    {
      title: t('cooperative.billing.table.member'),
      key: 'member',
      width: 220,
      render: (_value: unknown, installment) => (
        <Space orientation="vertical" size={0}>
          <Text strong>{installment.member_name}</Text>
          <Text type="secondary">{installment.member_number}</Text>
        </Space>
      ),
    },
    {
      title: t('cooperative.billing.table.loan'),
      dataIndex: 'loan_number',
      key: 'loan_number',
      width: 140,
    },
    {
      title: t('cooperative.billing.table.installmentNo'),
      dataIndex: 'installment_number',
      key: 'installment_number',
      align: 'right',
      width: 100,
    },
    {
      title: t('cooperative.billing.table.bill'),
      key: 'bill',
      align: 'right',
      width: 140,
      render: (_value: unknown, installment) => (
        `Rp ${formatCurrency(installment.principal_amount + installment.interest_amount + installment.penalty_amount)}`
      ),
    },
    {
      title: t('cooperative.billing.table.remaining'),
      key: 'remaining',
      align: 'right',
      width: 140,
      render: (_value: unknown, installment) => {
        const remaining = getInstallmentRemainingAmounts(installment);
        return <Text strong>Rp {formatCurrency(remaining.total_amount)}</Text>;
      },
    },
    {
      title: t('cooperative.billing.table.overdueDays'),
      key: 'overdueDays',
      align: 'right',
      width: 120,
      render: (_value: unknown, installment) => {
        const diff = dayjs().startOf('day').diff(dayjs(installment.due_date).startOf('day'), 'day');
        if (diff > 0 && installment.status !== 'PAID') {
          return <Text type="danger">{diff} Hari</Text>;
        }
        return '-';
      },
    },
    {
      title: t('cooperative.billing.table.status'),
      dataIndex: 'status',
      key: 'status',
      width: 140,
      render: (status: CooperativeLoanInstallmentStatus) => {
        const option = cooperativeLoanInstallmentStatusOptions.find((item) => item.value === status);
        return <Tag color={option?.color}>{statusLabels[status]}</Tag>;
      },
    },
    {
      title: t('cooperative.billing.table.action'),
      key: 'action',
      fixed: 'right',
      width: 180,
      render: (_value: unknown, installment) => {
        const loan = loanById.get(installment.loan_id);

        return (
          <Space size={4}>
            <Button
              type="text"
              icon={<Eye size={16} />}
              onClick={() => onView(installment)}
            />
            <Button
              type="text"
              icon={<CreditCard size={16} />}
              disabled={installment.status === 'PAID' || loan?.status !== 'DISBURSED'}
              data-testid={`koperasi-billing-pay-${installment.id}`}
              onClick={() => onPay(installment)}
            >
              {t('cooperative.billing.pay')}
            </Button>
          </Space>
        );
      },
    },
  ];

  return (
    <Table
      dataSource={installments}
      columns={columns}
      rowKey="id"
      loading={loading}
      onRow={(installment) => {
        const isOverdue = dayjs(installment.due_date).isBefore(dayjs().startOf('day')) && installment.status !== 'PAID';
        return {
          'data-testid': `koperasi-billing-row-${installment.member_number}-${installment.installment_number}`,
          className: isOverdue ? 'billing-overdue-row' : '',
        } as unknown as HTMLAttributes<HTMLElement>;
      }}
      pagination={{ pageSize: 8 }}
      scroll={{ x: 1350 }}
      locale={{ emptyText: t('cooperative.billing.empty') }}
    />
  );
}
