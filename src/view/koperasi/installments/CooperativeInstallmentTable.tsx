import { Button, InputNumber, Space, Table, Tag, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { Check, CreditCard, Eye } from 'lucide-react';
import { useState, type HTMLAttributes } from 'react';
import dayjs from '@/lib/dayjs';
import { useI18n } from '@/hooks/useI18n';
import type { CooperativeInstallmentLoanSummary } from '@/hooks/useCooperativeInstallments';
import type { CooperativeLoanStatus } from '@/types';
import { formatCurrency, formatDate } from '@/utils/formatters';
import { createTableMultiSorter } from '@/utils/tableSorting';
import { cooperativeLoanStatusOptions } from '../loans/loanOptions';

const { Text } = Typography;

const sortPriority = {
  disbursementDate: 90,
  member: 80,
  principalLoan: 70,
  totalBill: 60,
  totalPaid: 50,
  applicationDate: 40,
  totalRemaining: 30,
  position: 20,
  nextDueDate: 10,
};

interface CooperativeInstallmentTableProps {
  summaries: CooperativeInstallmentLoanSummary[];
  onPay: (summary: CooperativeInstallmentLoanSummary) => void;
  onQuickPay: (summary: CooperativeInstallmentLoanSummary, amount: number) => Promise<boolean>;
  onView: (summary: CooperativeInstallmentLoanSummary) => void;
  canPay?: boolean;
  loading?: boolean;
}

export default function CooperativeInstallmentTable({
  summaries,
  onPay,
  onQuickPay,
  onView,
  canPay = true,
  loading,
}: CooperativeInstallmentTableProps) {
  const { t } = useI18n();
  const [quickPaymentAmounts, setQuickPaymentAmounts] = useState<Record<string, number | null>>({});
  const statusLabels = cooperativeLoanStatusOptions.reduce<Record<CooperativeLoanStatus, string>>((acc, option) => {
    acc[option.value] = t(option.labelKey);
    return acc;
  }, {} as Record<CooperativeLoanStatus, string>);

  const setQuickPaymentAmount = (loanId: string, amount: number | null) => {
    setQuickPaymentAmounts((current) => ({ ...current, [loanId]: amount }));
  };

  const clearQuickPaymentAmount = (loanId: string) => {
    setQuickPaymentAmounts((current) => {
      const next = { ...current };
      delete next[loanId];
      return next;
    });
  };

  const handleQuickPay = async (summary: CooperativeInstallmentLoanSummary) => {
    const amount = Number(quickPaymentAmounts[summary.loan.id] || 0);
    if (amount <= 0) return;

    if (await onQuickPay(summary, amount)) {
      clearQuickPaymentAmount(summary.loan.id);
    }
  };

  const columns: ColumnsType<CooperativeInstallmentLoanSummary> = [
    {
      title: t('cooperative.installments.table.disbursementDate'),
      key: 'disbursementDate',
      fixed: 'left',
      width: 145,
      sorter: createTableMultiSorter<CooperativeInstallmentLoanSummary>(
        sortPriority.disbursementDate,
        (first, second) => (
          dayjs(first.loan.disbursed_at ?? 0).valueOf() - dayjs(second.loan.disbursed_at ?? 0).valueOf()
        ),
      ),
      render: (_value, summary) => (
        summary.loan.disbursed_at ? formatDate(summary.loan.disbursed_at) : '-'
      ),
    },
    {
      title: t('cooperative.installments.table.member'),
      key: 'member',
      fixed: 'left',
      width: 220,
      sorter: createTableMultiSorter<CooperativeInstallmentLoanSummary>(
        sortPriority.member,
        (first, second) => (
          first.loan.member_name.localeCompare(second.loan.member_name) ||
          first.loan.member_number.localeCompare(second.loan.member_number)
        ),
      ),
      defaultSortOrder: 'ascend',
      render: (_value, summary) => (
        <Space orientation="vertical" size={0}>
          <Text strong>{summary.loan.member_name}</Text>
          <Text type="secondary">{summary.loan.member_number}</Text>
        </Space>
      ),
    },
    {
      title: t('cooperative.installments.table.principalLoan'),
      key: 'principalLoan',
      fixed: 'left',
      width: 190,
      sorter: createTableMultiSorter<CooperativeInstallmentLoanSummary>(
        sortPriority.principalLoan,
        (first, second) => first.loan.principal_amount - second.loan.principal_amount,
      ),
      render: (_value, summary) => {
        const statusOption = cooperativeLoanStatusOptions.find((option) => option.value === summary.loan.status);
        return (
          <Space orientation="vertical" size={0}>
            <Text strong>Rp {formatCurrency(summary.loan.principal_amount)}</Text>
            <Text type="secondary">{summary.loan.loan_number}</Text>
            <Tag color={statusOption?.color}>{statusLabels[summary.loan.status]}</Tag>
          </Space>
        );
      },
    },
    {
      title: t('cooperative.installments.table.totalBill'),
      key: 'totalBill',
      align: 'right',
      width: 160,
      sorter: createTableMultiSorter<CooperativeInstallmentLoanSummary>(
        sortPriority.totalBill,
        (first, second) => first.totalBillAmount - second.totalBillAmount,
      ),
      render: (_value, summary) => `Rp ${formatCurrency(summary.totalBillAmount)}`,
    },
    {
      title: t('cooperative.installments.table.totalPaid'),
      key: 'totalPaid',
      align: 'right',
      width: 160,
      sorter: createTableMultiSorter<CooperativeInstallmentLoanSummary>(
        sortPriority.totalPaid,
        (first, second) => first.totalPaidAmount - second.totalPaidAmount,
      ),
      render: (_value, summary) => `Rp ${formatCurrency(summary.totalPaidAmount)}`,
    },
    {
      title: t('cooperative.installments.table.applicationDate'),
      key: 'applicationDate',
      width: 150,
      sorter: createTableMultiSorter<CooperativeInstallmentLoanSummary>(
        sortPriority.applicationDate,
        (first, second) => (
          dayjs(first.loan.application_date).valueOf() - dayjs(second.loan.application_date).valueOf()
        ),
      ),
      render: (_value, summary) => formatDate(summary.loan.application_date),
    },
    {
      title: t('cooperative.installments.table.totalRemaining'),
      key: 'totalRemaining',
      align: 'right',
      width: 170,
      sorter: createTableMultiSorter<CooperativeInstallmentLoanSummary>(
        sortPriority.totalRemaining,
        (first, second) => first.remainingAmount - second.remainingAmount,
      ),
      render: (_value, summary) => (
        <Text strong>Rp {formatCurrency(summary.remainingAmount)}</Text>
      ),
    },
    {
      title: t('cooperative.installments.table.position'),
      key: 'position',
      width: 190,
      sorter: createTableMultiSorter<CooperativeInstallmentLoanSummary>(
        sortPriority.position,
        (first, second) => (
          Number(first.nextInstallment?.installment_number ?? Number.MAX_SAFE_INTEGER) -
          Number(second.nextInstallment?.installment_number ?? Number.MAX_SAFE_INTEGER)
        ),
      ),
      render: (_value, summary) => {
        if (!summary.nextInstallment) {
          return (
            <Space orientation="vertical" size={0}>
              <Tag color="green">{t('cooperative.installments.position.paidOff')}</Tag>
              <Text type="secondary">
                {summary.paidInstallmentCount}/{summary.totalInstallmentCount}
              </Text>
            </Space>
          );
        }

        return (
          <Space orientation="vertical" size={0}>
            <Text strong>
              {t('cooperative.installments.position.next', {
                current: summary.nextInstallment.installment_number,
                total: summary.totalInstallmentCount,
              })}
            </Text>
            <Text type="secondary">
              {t('cooperative.installments.position.remaining', { count: summary.remainingInstallmentCount })}
            </Text>
            {summary.nextInstallment.status === 'PARTIAL' && (
              <Tag color="orange">{t('cooperative.loans.installmentStatus.partial')}</Tag>
            )}
          </Space>
        );
      },
    },
    {
      title: t('cooperative.installments.table.nextDueDate'),
      key: 'nextDueDate',
      width: 150,
      sorter: createTableMultiSorter<CooperativeInstallmentLoanSummary>(
        sortPriority.nextDueDate,
        (first, second) => (
          dayjs(first.nextInstallment?.due_date ?? '9999-12-31').valueOf() -
          dayjs(second.nextInstallment?.due_date ?? '9999-12-31').valueOf()
        ),
      ),
      render: (_value, summary) => (
        summary.nextInstallment ? formatDate(summary.nextInstallment.due_date) : '-'
      ),
    },
    {
      title: t('cooperative.installments.table.quickPayment'),
      key: 'quickPayment',
      align: 'right',
      width: 230,
      render: (_value, summary) => {
        const amount = quickPaymentAmounts[summary.loan.id] ?? null;
        const numericAmount = Number(amount || 0);
        const isPaymentDisabled = !canPay || !summary.nextInstallment || summary.loan.status !== 'DISBURSED';
        const canSubmit = !isPaymentDisabled &&
          !loading &&
          numericAmount > 0 &&
          numericAmount - summary.remainingAmount <= 0.01;

        return (
          <Space.Compact className="w-full">
            <InputNumber<number>
              min={1}
              max={summary.remainingAmount}
              value={amount}
              disabled={isPaymentDisabled || loading}
              controls={false}
              className="w-full"
              formatter={(value) => `Rp ${value ?? ''}`.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}
              parser={(value) => value?.replace(/Rp\s?|(\.*)/g, '') as unknown as number}
              placeholder="0"
              data-testid={`koperasi-installment-quick-payment-input-${summary.loan.id}`}
              onChange={(value) => setQuickPaymentAmount(summary.loan.id, value)}
              onPressEnter={() => void handleQuickPay(summary)}
            />
            <Tooltip title={t('cooperative.installments.quickPay.submit')}>
              <Button
                icon={<Check size={16} />}
                disabled={!canSubmit}
                loading={loading && numericAmount > 0}
                data-testid={`koperasi-installment-quick-payment-submit-${summary.loan.id}`}
                onClick={() => void handleQuickPay(summary)}
              />
            </Tooltip>
          </Space.Compact>
        );
      },
    },
    {
      title: t('cooperative.installments.table.action'),
      key: 'action',
      width: 210,
      render: (_value, summary) => (
        <Space size={4}>
          <Button type="text" icon={<Eye size={16} />} onClick={() => onView(summary)}>
            {t('cooperative.loans.view')}
          </Button>
          <Button
            type="text"
            icon={<CreditCard size={16} />}
            disabled={!canPay || !summary.nextInstallment || summary.loan.status !== 'DISBURSED'}
            data-testid={`koperasi-installment-pay-${summary.loan.id}`}
            onClick={() => onPay(summary)}
          >
            {t('cooperative.installments.pay')}
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <Table
      dataSource={summaries}
      columns={columns}
      rowKey={(summary) => summary.loan.id}
      loading={loading}
      onRow={(summary) => ({
        'data-testid': `koperasi-installment-loan-row-${summary.loan.member_number}-${summary.loan.loan_number}`,
      } as unknown as HTMLAttributes<HTMLElement>)}
      pagination={{ pageSize: 8 }}
      scroll={{ x: 2020 }}
      locale={{ emptyText: t('cooperative.installments.empty') }}
    />
  );
}
