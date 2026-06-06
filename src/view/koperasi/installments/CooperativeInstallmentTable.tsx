import { Button, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { CreditCard } from 'lucide-react';
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

interface CooperativeInstallmentTableProps {
  installments: CooperativeLoanInstallment[];
  loanById: Map<string, CooperativeLoan>;
  onPay: (installment: CooperativeLoanInstallment) => void;
  loading?: boolean;
}

export default function CooperativeInstallmentTable({
  installments,
  loanById,
  onPay,
  loading,
}: CooperativeInstallmentTableProps) {
  const { t } = useI18n();
  const statusLabels = cooperativeLoanInstallmentStatusOptions.reduce<Record<CooperativeLoanInstallmentStatus, string>>((acc, option) => {
    acc[option.value] = t(option.labelKey);
    return acc;
  }, {} as Record<CooperativeLoanInstallmentStatus, string>);

  const columns: ColumnsType<CooperativeLoanInstallment> = [
    {
      title: t('cooperative.installments.table.dueDate'),
      dataIndex: 'due_date',
      key: 'due_date',
      width: 150,
      render: (value: string) => formatDate(value),
    },
    {
      title: t('cooperative.installments.table.loan'),
      dataIndex: 'loan_number',
      key: 'loan_number',
      width: 220,
      render: (loanNumber: string, installment) => (
        <Space orientation="vertical" size={0}>
          <Text strong>{loanNumber}</Text>
          <Text type="secondary">
            {installment.member_number} - {installment.member_name}
          </Text>
        </Space>
      ),
    },
    {
      title: t('cooperative.installments.table.installmentNo'),
      dataIndex: 'installment_number',
      key: 'installment_number',
      align: 'right',
      width: 100,
    },
    {
      title: t('cooperative.installments.table.bill'),
      key: 'bill',
      align: 'right',
      width: 160,
      render: (_value: unknown, installment) => (
        `Rp ${formatCurrency(installment.principal_amount + installment.interest_amount + installment.penalty_amount)}`
      ),
    },
    {
      title: t('cooperative.installments.table.paid'),
      key: 'paid',
      align: 'right',
      width: 160,
      render: (_value: unknown, installment) => (
        `Rp ${formatCurrency(installment.paid_principal_amount + installment.paid_interest_amount + installment.paid_penalty_amount)}`
      ),
    },
    {
      title: t('cooperative.installments.table.remaining'),
      key: 'remaining',
      align: 'right',
      width: 160,
      render: (_value: unknown, installment) => {
        const remaining = getInstallmentRemainingAmounts(installment);
        return <Text strong>Rp {formatCurrency(remaining.total_amount)}</Text>;
      },
    },
    {
      title: t('cooperative.installments.table.status'),
      dataIndex: 'status',
      key: 'status',
      width: 140,
      render: (status: CooperativeLoanInstallmentStatus) => {
        const option = cooperativeLoanInstallmentStatusOptions.find((item) => item.value === status);
        return <Tag color={option?.color}>{statusLabels[status]}</Tag>;
      },
    },
    {
      title: t('cooperative.installments.table.action'),
      key: 'action',
      fixed: 'right',
      width: 150,
      render: (_value: unknown, installment) => {
        const loan = loanById.get(installment.loan_id);

        return (
          <Button
            type="text"
            icon={<CreditCard size={16} />}
            disabled={installment.status === 'PAID' || loan?.status !== 'DISBURSED'}
            onClick={() => onPay(installment)}
          >
            {t('cooperative.installments.pay')}
          </Button>
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
      pagination={{ pageSize: 8 }}
      scroll={{ x: 1200 }}
      locale={{ emptyText: t('cooperative.installments.empty') }}
    />
  );
}
