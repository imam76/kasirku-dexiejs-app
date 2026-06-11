import { Button, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { Check, Eye, Send, X } from 'lucide-react';
import type { HTMLAttributes } from 'react';
import { useI18n } from '@/hooks/useI18n';
import type { CooperativeLoan, CooperativeLoanStatus } from '@/types';
import { formatCurrency, formatDate } from '@/utils/formatters';
import {
  cooperativeLoanBillingFrequencyOptions,
  cooperativeLoanCalculationTypeOptions,
  cooperativeLoanStatusOptions,
} from './loanOptions';

const { Text } = Typography;

interface CooperativeLoanTableProps {
  loans: CooperativeLoan[];
  onView: (loan: CooperativeLoan) => void;
  onApprove: (loan: CooperativeLoan) => void;
  onReject: (loan: CooperativeLoan) => void;
  onDisburse: (loan: CooperativeLoan) => void;
  loading?: boolean;
}

export default function CooperativeLoanTable({
  loans,
  onView,
  onApprove,
  onReject,
  onDisburse,
  loading,
}: CooperativeLoanTableProps) {
  const { t } = useI18n();
  const statusLabels = cooperativeLoanStatusOptions.reduce<Record<CooperativeLoanStatus, string>>((acc, option) => {
    acc[option.value] = t(option.labelKey);
    return acc;
  }, {} as Record<CooperativeLoanStatus, string>);
  const calculationTypeLabels = cooperativeLoanCalculationTypeOptions.reduce<Record<string, string>>((acc, option) => {
    acc[option.value] = t(option.labelKey);
    return acc;
  }, {});
  const billingFrequencyLabels = cooperativeLoanBillingFrequencyOptions.reduce<Record<string, string>>((acc, option) => {
    acc[option.value] = t(option.labelKey);
    return acc;
  }, {});

  const columns: ColumnsType<CooperativeLoan> = [
    {
      title: t('cooperative.loans.table.loanNumber'),
      dataIndex: 'loan_number',
      key: 'loan_number',
      width: 190,
      render: (loanNumber: string, loan) => (
        <Space orientation="vertical" size={0}>
          <Text strong>{loanNumber}</Text>
          <Text type="secondary">{formatDate(loan.application_date)}</Text>
        </Space>
      ),
    },
    {
      title: t('cooperative.loans.table.member'),
      dataIndex: 'member_name',
      key: 'member_name',
      width: 220,
      render: (name: string, loan) => (
        <Space orientation="vertical" size={0}>
          <Text strong>{name}</Text>
          <Text type="secondary">{loan.member_number}</Text>
        </Space>
      ),
    },
    {
      title: t('cooperative.loans.table.principalAmount'),
      dataIndex: 'principal_amount',
      key: 'principal_amount',
      align: 'right',
      width: 160,
      render: (amount: number) => `Rp ${formatCurrency(amount)}`,
    },
    {
      title: t('cooperative.loans.table.scheme'),
      dataIndex: 'interest_rate_per_month',
      key: 'interest_rate_per_month',
      width: 170,
      render: (_rate: number, loan) => {
        const calculationType = loan.interest_calculation_type ?? 'MONTHLY_RATE';
        const rate = calculationType === 'TOTAL_PERCENT'
          ? loan.loan_service_rate ?? 0
          : loan.interest_rate_per_month;

        return (
          <Space orientation="vertical" size={0}>
            <Text>{calculationTypeLabels[calculationType]}</Text>
            <Text type="secondary">
              {calculationType === 'TOTAL_PERCENT'
                ? t('cooperative.loans.totalPercentRate', { rate })
                : t('cooperative.loans.monthlyRate', { rate })}
            </Text>
          </Space>
        );
      },
    },
    {
      title: t('cooperative.loans.table.installments'),
      dataIndex: 'tenor_months',
      key: 'tenor_months',
      width: 150,
      render: (tenor: number, loan) => {
        if ((loan.interest_calculation_type ?? 'MONTHLY_RATE') === 'TOTAL_PERCENT') {
          const frequency = loan.billing_frequency ?? 'MONTHLY';
          return (
            <Space orientation="vertical" size={0}>
              <Text>{t('cooperative.loans.installmentCount', { count: loan.installment_count ?? tenor })}</Text>
              <Text type="secondary">{billingFrequencyLabels[frequency]}</Text>
            </Space>
          );
        }

        return t('cooperative.loans.monthCount', { count: tenor });
      },
    },
    {
      title: t('cooperative.loans.table.totalPayable'),
      dataIndex: 'total_payable_amount',
      key: 'total_payable_amount',
      align: 'right',
      width: 170,
      render: (amount: number) => `Rp ${formatCurrency(amount)}`,
    },
    {
      title: t('cooperative.loans.table.status'),
      dataIndex: 'status',
      key: 'status',
      width: 130,
      render: (status: CooperativeLoanStatus) => {
        const option = cooperativeLoanStatusOptions.find((item) => item.value === status);
        return <Tag color={option?.color}>{statusLabels[status]}</Tag>;
      },
    },
    {
      title: t('cooperative.loans.table.action'),
      key: 'action',
      fixed: 'right',
      width: 300,
      render: (_value: unknown, loan) => (
        <Space wrap>
          <Button type="text" icon={<Eye size={16} />} onClick={() => onView(loan)}>
            {t('cooperative.loans.view')}
          </Button>
          <Button
            type="text"
            icon={<Check size={16} />}
            disabled={loan.status !== 'SUBMITTED'}
            data-testid={`koperasi-loan-approve-${loan.loan_number}`}
            onClick={() => onApprove(loan)}
          >
            {t('cooperative.loans.approve')}
          </Button>
          <Button
            danger
            type="text"
            icon={<X size={16} />}
            disabled={loan.status !== 'SUBMITTED'}
            data-testid={`koperasi-loan-reject-${loan.loan_number}`}
            onClick={() => onReject(loan)}
          >
            {t('cooperative.loans.reject')}
          </Button>
          <Button
            type="text"
            icon={<Send size={16} />}
            disabled={loan.status !== 'APPROVED'}
            data-testid={`koperasi-loan-disburse-${loan.loan_number}`}
            onClick={() => onDisburse(loan)}
          >
            {t('cooperative.loans.disburse')}
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <Table
      dataSource={loans}
      columns={columns}
      rowKey="id"
      loading={loading}
      onRow={(loan) => ({
        'data-testid': `koperasi-loan-row-${loan.member_number}`,
      } as unknown as HTMLAttributes<HTMLElement>)}
      pagination={{ pageSize: 8 }}
      scroll={{ x: 1400 }}
      locale={{ emptyText: t('cooperative.loans.empty') }}
    />
  );
}
