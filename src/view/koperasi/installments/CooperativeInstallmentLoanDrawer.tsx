import { Button, Descriptions, Drawer, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { CreditCard } from 'lucide-react';
import type { HTMLAttributes } from 'react';
import { useI18n } from '@/hooks/useI18n';
import type { CooperativeInstallmentLoanSummary } from '@/hooks/useCooperativeInstallments';
import type {
  CooperativeLoanInstallment,
  CooperativeLoanInstallmentStatus,
  CooperativeLoanPayment,
  CooperativeLoanPaymentStatus,
  CooperativeLoanStatus,
} from '@/types';
import { formatCurrency, formatDate } from '@/utils/formatters';
import { getInstallmentRemainingAmounts } from '@/utils/koperasi/loanPaymentAllocation';
import {
  cooperativeLoanInstallmentStatusOptions,
  cooperativeLoanStatusOptions,
} from '../loans/loanOptions';

const { Text, Title } = Typography;

interface CooperativeInstallmentLoanDrawerProps {
  summary: CooperativeInstallmentLoanSummary | null;
  payments: CooperativeLoanPayment[];
  open: boolean;
  canPay?: boolean;
  loading?: boolean;
  onClose: () => void;
  onPay: (summary: CooperativeInstallmentLoanSummary) => void;
}

export default function CooperativeInstallmentLoanDrawer({
  summary,
  payments,
  open,
  canPay = true,
  loading,
  onClose,
  onPay,
}: CooperativeInstallmentLoanDrawerProps) {
  const { t } = useI18n();
  const loanStatusLabels = cooperativeLoanStatusOptions.reduce<Record<CooperativeLoanStatus, string>>((acc, option) => {
    acc[option.value] = t(option.labelKey);
    return acc;
  }, {} as Record<CooperativeLoanStatus, string>);
  const installmentStatusLabels = cooperativeLoanInstallmentStatusOptions.reduce<Record<CooperativeLoanInstallmentStatus, string>>((acc, option) => {
    acc[option.value] = t(option.labelKey);
    return acc;
  }, {} as Record<CooperativeLoanInstallmentStatus, string>);
  const paymentStatusLabels: Record<CooperativeLoanPaymentStatus, string> = {
    POSTED: t('cooperative.installments.paymentStatus.posted'),
    REVERSED: t('cooperative.installments.paymentStatus.reversed'),
  };

  const installmentColumns: ColumnsType<CooperativeLoanInstallment> = [
    {
      title: t('cooperative.installments.table.installmentNo'),
      dataIndex: 'installment_number',
      key: 'installment_number',
      width: 90,
      sorter: (first, second) => first.installment_number - second.installment_number,
    },
    {
      title: t('cooperative.installments.table.dueDate'),
      dataIndex: 'due_date',
      key: 'due_date',
      width: 140,
      render: (value: string) => formatDate(value),
    },
    {
      title: t('cooperative.installments.table.bill'),
      key: 'bill',
      align: 'right',
      width: 150,
      render: (_value, installment) => (
        `Rp ${formatCurrency(installment.principal_amount + installment.interest_amount + installment.penalty_amount)}`
      ),
    },
    {
      title: t('cooperative.installments.table.paid'),
      key: 'paid',
      align: 'right',
      width: 150,
      render: (_value, installment) => (
        `Rp ${formatCurrency(installment.paid_principal_amount + installment.paid_interest_amount + installment.paid_penalty_amount)}`
      ),
    },
    {
      title: t('cooperative.installments.table.remaining'),
      key: 'remaining',
      align: 'right',
      width: 150,
      render: (_value, installment) => (
        <Text strong>Rp {formatCurrency(getInstallmentRemainingAmounts(installment).total_amount)}</Text>
      ),
    },
    {
      title: t('cooperative.installments.table.status'),
      dataIndex: 'status',
      key: 'status',
      width: 130,
      render: (status: CooperativeLoanInstallmentStatus) => {
        const option = cooperativeLoanInstallmentStatusOptions.find((item) => item.value === status);
        return <Tag color={option?.color}>{installmentStatusLabels[status]}</Tag>;
      },
    },
  ];

  const paymentColumns: ColumnsType<CooperativeLoanPayment> = [
    {
      title: t('cooperative.installments.payments.paymentDate'),
      dataIndex: 'payment_date',
      key: 'payment_date',
      width: 140,
      render: (value: string) => formatDate(value),
    },
    {
      title: t('cooperative.installments.payments.paymentNumber'),
      dataIndex: 'payment_number',
      key: 'payment_number',
      width: 210,
      render: (value: string, payment) => (
        <Space orientation="vertical" size={0}>
          <Text>{value}</Text>
          {payment.payment_group_number && <Text type="secondary">{payment.payment_group_number}</Text>}
        </Space>
      ),
    },
    {
      title: t('cooperative.installments.payments.amount'),
      dataIndex: 'amount',
      key: 'amount',
      align: 'right',
      width: 150,
      render: (value: number, payment) => (
        <span className={payment.status === 'REVERSED' ? 'line-through text-gray-400' : ''}>
          Rp {formatCurrency(value)}
        </span>
      ),
    },
    {
      title: t('finance.cashAccount'),
      key: 'cashAccount',
      width: 200,
      render: (_value, payment) => (
        payment.cash_account_code && payment.cash_account_name
          ? `${payment.cash_account_code} - ${payment.cash_account_name}`
          : '-'
      ),
    },
    {
      title: t('cooperative.installments.payments.status'),
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (status: CooperativeLoanPaymentStatus) => (
        <Tag color={status === 'POSTED' ? 'green' : 'red'}>{paymentStatusLabels[status]}</Tag>
      ),
    },
  ];

  const loanPayments = summary
    ? payments.filter((payment) => payment.loan_id === summary.loan.id)
    : [];
  const loanStatusOption = summary
    ? cooperativeLoanStatusOptions.find((option) => option.value === summary.loan.status)
    : undefined;

  return (
    <Drawer
      title={summary
        ? `${summary.loan.loan_number} - ${summary.loan.member_name}`
        : t('cooperative.installments.detail.title')}
      open={open}
      onClose={onClose}
      width={920}
      destroyOnHidden
      footer={summary ? (
        <Space className="w-full justify-end">
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            type="primary"
            icon={<CreditCard size={16} />}
            disabled={!canPay || !summary.nextInstallment || summary.loan.status !== 'DISBURSED'}
            loading={loading}
            onClick={() => {
              onClose();
              onPay(summary);
            }}
          >
            {t('cooperative.installments.addPayment')}
          </Button>
        </Space>
      ) : undefined}
    >
      {summary && (
        <div className="space-y-6">
          <div>
            <Title level={5}>{t('cooperative.installments.detail.loanInfo')}</Title>
            <Descriptions column={{ xs: 1, sm: 2 }} size="small" bordered>
              <Descriptions.Item label={t('cooperative.installments.table.member')}>
                {summary.loan.member_number} - {summary.loan.member_name}
              </Descriptions.Item>
              <Descriptions.Item label={t('cooperative.installments.table.loan')}>
                {summary.loan.loan_number}
              </Descriptions.Item>
              <Descriptions.Item label={t('cooperative.loans.table.status')}>
                <Tag color={loanStatusOption?.color}>{loanStatusLabels[summary.loan.status]}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label={t('cooperative.loans.form.principalAmount')}>
                Rp {formatCurrency(summary.loan.principal_amount)}
              </Descriptions.Item>
              <Descriptions.Item label={t('cooperative.installments.table.applicationDate')}>
                {formatDate(summary.loan.application_date)}
              </Descriptions.Item>
              <Descriptions.Item label={t('cooperative.installments.table.disbursementDate')}>
                {summary.loan.disbursed_at ? formatDate(summary.loan.disbursed_at) : '-'}
              </Descriptions.Item>
              <Descriptions.Item label={t('cooperative.installments.table.totalBill')}>
                Rp {formatCurrency(summary.totalBillAmount)}
              </Descriptions.Item>
              <Descriptions.Item label={t('cooperative.installments.table.totalPaid')}>
                Rp {formatCurrency(summary.totalPaidAmount)}
              </Descriptions.Item>
              <Descriptions.Item label={t('cooperative.installments.table.totalRemaining')}>
                <Text strong>Rp {formatCurrency(summary.remainingAmount)}</Text>
              </Descriptions.Item>
              <Descriptions.Item label={t('cooperative.installments.table.position')}>
                {summary.nextInstallment
                  ? t('cooperative.installments.position.nextWithRemaining', {
                      current: summary.nextInstallment.installment_number,
                      total: summary.totalInstallmentCount,
                      count: summary.remainingInstallmentCount,
                    })
                  : t('cooperative.installments.position.paidOff')}
              </Descriptions.Item>
            </Descriptions>
          </div>

          <div>
            <Title level={5}>{t('cooperative.installments.detail.schedule')}</Title>
            <Table
              dataSource={summary.installments}
              columns={installmentColumns}
              rowKey="id"
              pagination={false}
              size="small"
              scroll={{ x: 810 }}
              onRow={(installment) => ({
                'data-testid': `koperasi-installment-detail-row-${installment.member_number}-${installment.installment_number}`,
              } as unknown as HTMLAttributes<HTMLElement>)}
              locale={{ emptyText: t('cooperative.installments.empty') }}
            />
          </div>

          <div>
            <Title level={5}>{t('cooperative.installments.detail.paymentHistory')}</Title>
            <Table
              dataSource={loanPayments}
              columns={paymentColumns}
              rowKey="id"
              pagination={{ pageSize: 5, hideOnSinglePage: true }}
              size="small"
              scroll={{ x: 820 }}
              locale={{ emptyText: t('cooperative.installments.payments.empty') }}
            />
          </div>
        </div>
      )}
    </Drawer>
  );
}
