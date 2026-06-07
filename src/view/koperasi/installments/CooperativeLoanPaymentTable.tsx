import { Button, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { Ban, Eye } from 'lucide-react';
import type { HTMLAttributes } from 'react';
import { useI18n } from '@/hooks/useI18n';
import type { CooperativeLoanPayment, CooperativeLoanPaymentStatus } from '@/types';
import { formatCurrency, formatDate } from '@/utils/formatters';

const { Text } = Typography;

interface CooperativeLoanPaymentTableProps {
  payments: CooperativeLoanPayment[];
  onView: (payment: CooperativeLoanPayment) => void;
  onReverse: (payment: CooperativeLoanPayment) => void;
  loading?: boolean;
}

export default function CooperativeLoanPaymentTable({
  payments,
  onView,
  onReverse,
  loading,
}: CooperativeLoanPaymentTableProps) {
  const { t } = useI18n();
  const statusLabels: Record<CooperativeLoanPaymentStatus, string> = {
    POSTED: t('cooperative.installments.paymentStatus.posted'),
    REVERSED: t('cooperative.installments.paymentStatus.reversed'),
  };

  const columns: ColumnsType<CooperativeLoanPayment> = [
    {
      title: t('cooperative.installments.payments.paymentDate'),
      dataIndex: 'payment_date',
      key: 'payment_date',
      width: 160,
      render: (value: string) => formatDate(value),
    },
    {
      title: t('cooperative.installments.payments.paymentNumber'),
      dataIndex: 'payment_number',
      key: 'payment_number',
      width: 210,
      render: (paymentNumber: string, payment) => (
        <Space orientation="vertical" size={0}>
          <Text strong>{paymentNumber}</Text>
          {payment.payment_type === 'REVERSAL' && (
            <Text type="secondary">{t('cooperative.installments.paymentType.reversal')}</Text>
          )}
        </Space>
      ),
    },
    {
      title: t('cooperative.installments.table.loan'),
      dataIndex: 'loan_number',
      key: 'loan_number',
      width: 220,
      render: (loanNumber: string, payment) => (
        <Space orientation="vertical" size={0}>
          <Text strong>{loanNumber}</Text>
          <Text type="secondary">
            {payment.member_number} - {payment.member_name}
          </Text>
        </Space>
      ),
    },
    {
      title: t('cooperative.installments.payments.amount'),
      dataIndex: 'amount',
      key: 'amount',
      align: 'right',
      width: 150,
      render: (amount: number, payment) => (
        <span className={payment.status === 'REVERSED' ? 'line-through text-gray-400' : 'font-semibold'}>
          Rp {formatCurrency(amount)}
        </span>
      ),
    },
    {
      title: t('cooperative.installments.payments.allocation'),
      key: 'allocation',
      width: 260,
      render: (_value: unknown, payment) => (
        <Space size={[0, 4]} wrap>
          <Tag>{t('cooperative.installments.installments.principalShort')}: Rp {formatCurrency(payment.principal_amount)}</Tag>
          <Tag>{t('cooperative.installments.installments.interestShort')}: Rp {formatCurrency(payment.interest_amount)}</Tag>
          {payment.penalty_amount > 0 && (
            <Tag>{t('cooperative.installments.installments.penaltyShort')}: Rp {formatCurrency(payment.penalty_amount)}</Tag>
          )}
        </Space>
      ),
    },
    {
      title: t('finance.cashAccount'),
      dataIndex: 'cash_account_name',
      key: 'cash_account_name',
      width: 220,
      render: (_value: string | undefined, payment) => (
        payment.cash_account_code && payment.cash_account_name
          ? `${payment.cash_account_code} - ${payment.cash_account_name}`
          : '-'
      ),
    },
    {
      title: t('cooperative.installments.payments.status'),
      dataIndex: 'status',
      key: 'status',
      width: 130,
      render: (status: CooperativeLoanPaymentStatus, payment) => (
        <div>
          <Tag color={status === 'POSTED' ? 'green' : 'red'}>{statusLabels[status]}</Tag>
          {payment.reversal_reason && (
            <div className="mt-1 text-xs text-gray-500">{payment.reversal_reason}</div>
          )}
        </div>
      ),
    },
    {
      title: t('cooperative.installments.table.action'),
      key: 'action',
      fixed: 'right',
      width: 190,
      render: (_value: unknown, payment) => (
        <Space wrap>
          <Button type="text" icon={<Eye size={16} />} onClick={() => onView(payment)}>
            {t('cooperative.loans.view')}
          </Button>
          <Button
            danger
            type="text"
            icon={<Ban size={16} />}
            disabled={payment.status !== 'POSTED' || payment.payment_type === 'REVERSAL' || Boolean(payment.reversal_of_payment_id)}
            data-testid={`koperasi-installment-payment-reverse-${payment.payment_number}`}
            onClick={() => onReverse(payment)}
          >
            {t('cooperative.installments.reverse')}
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <Table
      dataSource={payments}
      columns={columns}
      rowKey="id"
      loading={loading}
      onRow={(payment) => ({
        'data-testid': `koperasi-installment-payment-row-${payment.payment_number}`,
      } as unknown as HTMLAttributes<HTMLElement>)}
      pagination={{ pageSize: 8 }}
      scroll={{ x: 1500 }}
      locale={{ emptyText: t('cooperative.installments.payments.empty') }}
    />
  );
}
