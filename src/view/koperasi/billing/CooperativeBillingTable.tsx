import { Button, InputNumber, Space, Table, Tag, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { CalendarClock, Check, CreditCard, Eye } from 'lucide-react';
import { useState, type HTMLAttributes } from 'react';
import dayjs from '@/lib/dayjs';
import { useI18n } from '@/hooks/useI18n';
import type {
  CooperativeLoan,
  CooperativeLoanInstallment,
  CooperativeLoanInstallmentCollectionStatus,
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
  onQuickPay: (installment: CooperativeLoanInstallment, amount: number) => Promise<boolean>;
  onCollect: (installment: CooperativeLoanInstallment) => void;
  onView: (installment: CooperativeLoanInstallment) => void;
  canPay?: boolean;
  canCollect?: boolean;
  loading?: boolean;
}

export default function CooperativeBillingTable({
  installments,
  loanById,
  onPay,
  onQuickPay,
  onCollect,
  onView,
  canPay = true,
  canCollect = true,
  loading,
}: CooperativeBillingTableProps) {
  const { t } = useI18n();
  const [quickPaymentAmounts, setQuickPaymentAmounts] = useState<Record<string, number | null>>({});
  const statusLabels = cooperativeLoanInstallmentStatusOptions.reduce<Record<CooperativeLoanInstallmentStatus, string>>((acc, option) => {
    acc[option.value] = t(option.labelKey);
    return acc;
  }, {} as Record<CooperativeLoanInstallmentStatus, string>);
  const collectionStatusLabels: Record<CooperativeLoanInstallmentCollectionStatus, string> = {
    NONE: t('cooperative.billing.collection.status.none'),
    PROMISED_TO_PAY: t('cooperative.billing.collection.status.promisedToPay'),
    UNABLE_TO_PAY: t('cooperative.billing.collection.status.unableToPay'),
    FOLLOW_UP: t('cooperative.billing.collection.status.followUp'),
  };
  const collectionStatusColors: Record<CooperativeLoanInstallmentCollectionStatus, string> = {
    NONE: 'default',
    PROMISED_TO_PAY: 'green',
    UNABLE_TO_PAY: 'volcano',
    FOLLOW_UP: 'gold',
  };
  const getBillAmount = (installment: CooperativeLoanInstallment) => (
    installment.principal_amount + installment.interest_amount + installment.penalty_amount
  );
  const getLoanPrincipalAmount = (installment: CooperativeLoanInstallment) => (
    Number(loanById.get(installment.loan_id)?.principal_amount || 0)
  );
  const getRemainingAmount = (installment: CooperativeLoanInstallment) => (
    getInstallmentRemainingAmounts(installment).total_amount
  );
  const getLoanRemainingAmount = (loan: CooperativeLoan | undefined, fallbackAmount: number) => {
    if (!loan) return fallbackAmount;

    return Math.max(
      0,
      Number(loan.outstanding_principal_amount || 0) +
        Number(loan.outstanding_interest_amount || 0) +
        Number(loan.outstanding_penalty_amount || 0),
    );
  };
  const getOverdueDays = (installment: CooperativeLoanInstallment) => {
    if (installment.status === 'PAID') return 0;
    return Math.max(0, dayjs().startOf('day').diff(dayjs(installment.due_date).startOf('day'), 'day'));
  };
  const setQuickPaymentAmount = (installmentId: string, amount: number | null) => {
    setQuickPaymentAmounts((current) => ({
      ...current,
      [installmentId]: amount,
    }));
  };
  const clearQuickPaymentAmount = (installmentId: string) => {
    setQuickPaymentAmounts((current) => {
      const next = { ...current };
      delete next[installmentId];
      return next;
    });
  };
  const handleQuickPay = async (installment: CooperativeLoanInstallment) => {
    const amount = Number(quickPaymentAmounts[installment.id] || 0);
    if (amount <= 0) return;

    const isSaved = await onQuickPay(installment, amount);
    if (isSaved) {
      clearQuickPaymentAmount(installment.id);
    }
  };

  const columns: ColumnsType<CooperativeLoanInstallment> = [
    {
      title: t('cooperative.billing.table.dueDate'),
      dataIndex: 'due_date',
      key: 'due_date',
      fixed: 'left',
      width: 150,
      sorter: (first, second) => dayjs(first.due_date).valueOf() - dayjs(second.due_date).valueOf(),
      defaultSortOrder: 'ascend',
      render: (value: string) => {
        const isOverdue = dayjs(value).isBefore(dayjs().startOf('day'));
        return <Text type={isOverdue ? 'danger' : undefined}>{formatDate(value)}</Text>;
      },
    },
    {
      title: t('cooperative.billing.table.member'),
      key: 'member',
      fixed: 'left',
      width: 220,
      sorter: (first, second) => (
        first.member_number.localeCompare(second.member_number) ||
        first.member_name.localeCompare(second.member_name)
      ),
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
      sorter: (first, second) => first.loan_number.localeCompare(second.loan_number),
    },
    {
      title: t('cooperative.billing.table.loanPrincipal'),
      key: 'loanPrincipal',
      align: 'right',
      width: 150,
      sorter: (first, second) => getLoanPrincipalAmount(first) - getLoanPrincipalAmount(second),
      render: (_value: unknown, installment) => (
        `Rp ${formatCurrency(getLoanPrincipalAmount(installment))}`
      ),
    },
    {
      title: t('cooperative.billing.table.installmentNo'),
      dataIndex: 'installment_number',
      key: 'installment_number',
      align: 'right',
      width: 100,
      sorter: (first, second) => first.installment_number - second.installment_number,
    },
    {
      title: t('cooperative.billing.table.bill'),
      key: 'bill',
      align: 'right',
      width: 140,
      sorter: (first, second) => getBillAmount(first) - getBillAmount(second),
      render: (_value: unknown, installment) => (
        `Rp ${formatCurrency(getBillAmount(installment))}`
      ),
    },
    {
      title: t('cooperative.billing.table.remaining'),
      key: 'remaining',
      align: 'right',
      width: 140,
      sorter: (first, second) => getRemainingAmount(first) - getRemainingAmount(second),
      render: (_value: unknown, installment) => {
        return <Text strong>Rp {formatCurrency(getRemainingAmount(installment))}</Text>;
      },
    },
    {
      title: t('cooperative.billing.table.overdueDays'),
      key: 'overdueDays',
      align: 'right',
      width: 120,
      sorter: (first, second) => getOverdueDays(first) - getOverdueDays(second),
      render: (_value: unknown, installment) => {
        const diff = getOverdueDays(installment);
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
      sorter: (first, second) => statusLabels[first.status].localeCompare(statusLabels[second.status]),
      render: (status: CooperativeLoanInstallmentStatus) => {
        const option = cooperativeLoanInstallmentStatusOptions.find((item) => item.value === status);
        return <Tag color={option?.color}>{statusLabels[status]}</Tag>;
      },
    },
    {
      title: t('cooperative.billing.table.collection'),
      key: 'collection',
      width: 170,
      sorter: (first, second) => {
        const firstStatus = first.collection_status ?? 'NONE';
        const secondStatus = second.collection_status ?? 'NONE';
        return collectionStatusLabels[firstStatus].localeCompare(collectionStatusLabels[secondStatus]) ||
          (first.follow_up_date ?? '').localeCompare(second.follow_up_date ?? '');
      },
      render: (_value: unknown, installment) => {
        const collectionStatus = installment.collection_status ?? 'NONE';
        return (
          <Space direction="vertical" size={0}>
            <Tag color={collectionStatusColors[collectionStatus]}>{collectionStatusLabels[collectionStatus]}</Tag>
            {installment.follow_up_date && (
              <Text type="secondary">{formatDate(installment.follow_up_date)}</Text>
            )}
          </Space>
        );
      },
    },
    {
      title: t('cooperative.billing.table.quickPayment'),
      key: 'quickPayment',
      align: 'right',
      width: 230,
      render: (_value: unknown, installment) => {
        const loan = loanById.get(installment.loan_id);
        const remainingAmount = getRemainingAmount(installment);
        const loanRemainingAmount = getLoanRemainingAmount(loan, remainingAmount);
        const amount = quickPaymentAmounts[installment.id] ?? null;
        const numericAmount = Number(amount || 0);
        const isPaymentDisabled = !canPay || installment.status === 'PAID' || loan?.status !== 'DISBURSED';
        const canSubmit = !isPaymentDisabled &&
          !loading &&
          numericAmount > 0 &&
          numericAmount - loanRemainingAmount <= 0.01;

        return (
          <Space.Compact className="w-full">
            <InputNumber<number>
              min={1}
              max={loanRemainingAmount}
              value={amount}
              disabled={isPaymentDisabled || loading}
              controls={false}
              className="w-full"
              formatter={(value) => `Rp ${value ?? ''}`.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}
              parser={(value) => value?.replace(/Rp\s?|(\.*)/g, '') as unknown as number}
              placeholder="0"
              data-testid={`koperasi-billing-quick-payment-input-${installment.id}`}
              onChange={(value) => setQuickPaymentAmount(installment.id, value)}
              onPressEnter={() => void handleQuickPay(installment)}
            />
            <Tooltip title={t('cooperative.billing.quickPay.submit')}>
              <Button
                icon={<Check size={16} />}
                disabled={!canSubmit}
                loading={loading && numericAmount > 0}
                data-testid={`koperasi-billing-quick-payment-submit-${installment.id}`}
                onClick={() => void handleQuickPay(installment)}
              />
            </Tooltip>
          </Space.Compact>
        );
      },
    },
    {
      title: t('cooperative.billing.table.action'),
      key: 'action',
      fixed: 'right',
      width: 220,
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
              disabled={!canPay || installment.status === 'PAID' || loan?.status !== 'DISBURSED'}
              data-testid={`koperasi-billing-pay-${installment.id}`}
              onClick={() => onPay(installment)}
            >
              {t('cooperative.billing.pay')}
            </Button>
            <Tooltip title={t('cooperative.billing.collect')}>
              <Button
                type="text"
                icon={<CalendarClock size={16} />}
                disabled={!canCollect || installment.status === 'PAID' || loan?.status !== 'DISBURSED'}
                data-testid={`koperasi-billing-collect-${installment.id}`}
                onClick={() => onCollect(installment)}
              />
            </Tooltip>
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
      scroll={{ x: 2030 }}
      locale={{ emptyText: t('cooperative.billing.empty') }}
    />
  );
}
