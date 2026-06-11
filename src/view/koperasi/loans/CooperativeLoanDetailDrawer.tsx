import { Descriptions, Drawer, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useMemo } from 'react';
import { useI18n } from '@/hooks/useI18n';
import type {
  CooperativeLoan,
  CooperativeLoanInstallment,
  CooperativeLoanInstallmentStatus,
  CooperativeLoanStatus,
} from '@/types';
import { formatCurrency, formatDate } from '@/utils/formatters';
import {
  cooperativeLoanBillingFrequencyOptions,
  cooperativeLoanCalculationTypeOptions,
  cooperativeLoanInstallmentStatusOptions,
  cooperativeLoanStatusOptions,
} from './loanOptions';

const { Paragraph } = Typography;

interface CooperativeLoanDetailDrawerProps {
  loan: CooperativeLoan | null;
  installments: CooperativeLoanInstallment[];
  open: boolean;
  onClose: () => void;
}

export default function CooperativeLoanDetailDrawer({
  loan,
  installments,
  open,
  onClose,
}: CooperativeLoanDetailDrawerProps) {
  const { t } = useI18n();
  const statusLabels = cooperativeLoanStatusOptions.reduce<Record<CooperativeLoanStatus, string>>((acc, option) => {
    acc[option.value] = t(option.labelKey);
    return acc;
  }, {} as Record<CooperativeLoanStatus, string>);
  const installmentStatusLabels = cooperativeLoanInstallmentStatusOptions.reduce<Record<CooperativeLoanInstallmentStatus, string>>((acc, option) => {
    acc[option.value] = t(option.labelKey);
    return acc;
  }, {} as Record<CooperativeLoanInstallmentStatus, string>);
  const calculationTypeLabels = cooperativeLoanCalculationTypeOptions.reduce<Record<string, string>>((acc, option) => {
    acc[option.value] = t(option.labelKey);
    return acc;
  }, {});
  const billingFrequencyLabels = cooperativeLoanBillingFrequencyOptions.reduce<Record<string, string>>((acc, option) => {
    acc[option.value] = t(option.labelKey);
    return acc;
  }, {});
  const statusOption = loan
    ? cooperativeLoanStatusOptions.find((option) => option.value === loan.status)
    : undefined;
  const calculationType = loan?.interest_calculation_type ?? 'MONTHLY_RATE';
  const interestLabel = calculationType === 'TOTAL_PERCENT'
    ? t('cooperative.loans.installments.loanService')
    : t('cooperative.loans.installments.interest');
  const outstandingInterestLabel = calculationType === 'TOTAL_PERCENT'
    ? t('cooperative.loans.outstandingLoanService')
    : t('cooperative.loans.outstandingInterest');

  const installmentColumns = useMemo<ColumnsType<CooperativeLoanInstallment>>(() => [
    {
      title: t('cooperative.loans.installments.number'),
      dataIndex: 'installment_number',
      key: 'installment_number',
      width: 90,
    },
    {
      title: t('cooperative.loans.installments.dueDate'),
      dataIndex: 'due_date',
      key: 'due_date',
      width: 150,
      render: (value: string) => formatDate(value),
    },
    {
      title: t('cooperative.loans.installments.principal'),
      dataIndex: 'principal_amount',
      key: 'principal_amount',
      align: 'right',
      width: 140,
      render: (value: number) => `Rp ${formatCurrency(value)}`,
    },
    {
      title: interestLabel,
      dataIndex: 'interest_amount',
      key: 'interest_amount',
      align: 'right',
      width: 140,
      render: (value: number) => `Rp ${formatCurrency(value)}`,
    },
    {
      title: t('cooperative.loans.installments.total'),
      key: 'total',
      align: 'right',
      width: 150,
      render: (_value: unknown, installment) => (
        `Rp ${formatCurrency(installment.principal_amount + installment.interest_amount + installment.penalty_amount)}`
      ),
    },
    {
      title: t('cooperative.loans.installments.status'),
      dataIndex: 'status',
      key: 'status',
      width: 130,
      render: (status: CooperativeLoanInstallmentStatus) => {
        const option = cooperativeLoanInstallmentStatusOptions.find((item) => item.value === status);
        return <Tag color={option?.color}>{installmentStatusLabels[status]}</Tag>;
      },
    },
  ], [installmentStatusLabels, interestLabel, t]);

  return (
    <Drawer
      title={loan ? `${loan.loan_number} - ${loan.member_name}` : t('cooperative.loans.detailTitle')}
      open={open}
      onClose={onClose}
      width={760}
      destroyOnHidden
    >
      {loan && (
        <div className="space-y-5">
          <Descriptions column={1} size="small" bordered>
            <Descriptions.Item label={t('cooperative.loans.table.status')}>
              <Tag color={statusOption?.color}>{statusLabels[loan.status]}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label={t('cooperative.loans.table.loanNumber')}>
              {loan.loan_number}
            </Descriptions.Item>
            <Descriptions.Item label={t('cooperative.loans.table.member')}>
              {loan.member_number} - {loan.member_name}
            </Descriptions.Item>
            <Descriptions.Item label={t('cooperative.loans.form.applicationDate')}>
              {formatDate(loan.application_date)}
            </Descriptions.Item>
            <Descriptions.Item label={t('cooperative.loans.form.principalAmount')}>
              Rp {formatCurrency(loan.principal_amount)}
            </Descriptions.Item>
            <Descriptions.Item label={t('cooperative.loans.form.calculationType')}>
              {calculationTypeLabels[calculationType]}
            </Descriptions.Item>
            {calculationType === 'MONTHLY_RATE' ? (
              <>
                <Descriptions.Item label={t('cooperative.loans.form.interestRate')}>
                  {loan.interest_rate_per_month}%
                </Descriptions.Item>
                <Descriptions.Item label={t('cooperative.loans.form.tenor')}>
                  {t('cooperative.loans.monthCount', { count: loan.tenor_months })}
                </Descriptions.Item>
              </>
            ) : (
              <>
                <Descriptions.Item label={t('cooperative.loans.form.loanServiceRate')}>
                  {loan.loan_service_rate ?? 0}%
                </Descriptions.Item>
                <Descriptions.Item label={t('cooperative.loans.form.installmentCount')}>
                  {t('cooperative.loans.installmentCount', { count: loan.installment_count ?? loan.tenor_months })}
                </Descriptions.Item>
                <Descriptions.Item label={t('cooperative.loans.form.billingFrequency')}>
                  {billingFrequencyLabels[loan.billing_frequency ?? 'MONTHLY']}
                </Descriptions.Item>
                <Descriptions.Item label={t('cooperative.loans.form.adminFeeRate')}>
                  {loan.admin_fee_rate ?? 0}% / Rp {formatCurrency(loan.admin_fee_amount ?? 0)}
                </Descriptions.Item>
                <Descriptions.Item label={t('cooperative.loans.form.mandatorySavingRate')}>
                  {loan.mandatory_saving_rate ?? 0}% / Rp {formatCurrency(loan.mandatory_saving_amount ?? 0)}
                </Descriptions.Item>
                <Descriptions.Item label={t('cooperative.loans.deductionMethod')}>
                  {loan.deduction_method === 'DEDUCT_ON_DISBURSEMENT'
                    ? t('cooperative.loans.deductionMethod.deductOnDisbursement')
                    : t('cooperative.loans.deductionMethod.none')}
                </Descriptions.Item>
                <Descriptions.Item label={t('cooperative.loans.netDisbursement')}>
                  Rp {formatCurrency(loan.net_disbursement_amount ?? loan.principal_amount)}
                </Descriptions.Item>
              </>
            )}
            <Descriptions.Item label={calculationType === 'TOTAL_PERCENT' ? t('cooperative.loans.table.totalLoanService') : t('cooperative.loans.table.totalInterest')}>
              Rp {formatCurrency(loan.total_interest_amount)}
            </Descriptions.Item>
            <Descriptions.Item label={t('cooperative.loans.table.totalPayable')}>
              Rp {formatCurrency(loan.total_payable_amount)}
            </Descriptions.Item>
            <Descriptions.Item label={t('cooperative.loans.outstandingPrincipal')}>
              Rp {formatCurrency(loan.outstanding_principal_amount)}
            </Descriptions.Item>
            <Descriptions.Item label={outstandingInterestLabel}>
              Rp {formatCurrency(loan.outstanding_interest_amount)}
            </Descriptions.Item>
            <Descriptions.Item label={t('cooperative.loans.approvedAt')}>
              {loan.approved_at ? formatDate(loan.approved_at) : '-'}
            </Descriptions.Item>
            <Descriptions.Item label={t('cooperative.loans.rejectedAt')}>
              {loan.rejected_at ? formatDate(loan.rejected_at) : '-'}
            </Descriptions.Item>
            <Descriptions.Item label={t('cooperative.loans.disbursedAt')}>
              {loan.disbursed_at ? formatDate(loan.disbursed_at) : '-'}
            </Descriptions.Item>
            <Descriptions.Item label={t('finance.cashAccount')}>
              {loan.cash_account_code && loan.cash_account_name
                ? `${loan.cash_account_code} - ${loan.cash_account_name}`
                : '-'}
            </Descriptions.Item>
            <Descriptions.Item label={t('checkout.method')}>
              {loan.payment_method === 'NON_TUNAI' ? t('payment.nonCash') : loan.payment_method === 'TUNAI' ? t('payment.cash') : '-'}
            </Descriptions.Item>
            <Descriptions.Item label={t('finance.paymentChannel')}>
              {loan.payment_channel || '-'}
            </Descriptions.Item>
            <Descriptions.Item label={t('cooperative.savings.financeTransaction')}>
              {loan.finance_transaction_id || '-'}
            </Descriptions.Item>
            <Descriptions.Item label={t('cooperative.savings.journalEntry')}>
              {loan.journal_entry_id || '-'}
            </Descriptions.Item>
            <Descriptions.Item label={t('cooperative.members.detail.createdBy')}>
              {loan.created_by_name || '-'}
            </Descriptions.Item>
            <Descriptions.Item label={t('cooperative.members.detail.updatedBy')}>
              {loan.updated_by_name || '-'}
            </Descriptions.Item>
          </Descriptions>

          <div>
            <Paragraph className="mb-1 text-sm font-medium text-gray-600">
              {t('cooperative.loans.form.notes')}
            </Paragraph>
            <Paragraph className="whitespace-pre-wrap text-gray-700">
              {loan.notes || '-'}
            </Paragraph>
          </div>

          {loan.approval_notes && (
            <div>
              <Paragraph className="mb-1 text-sm font-medium text-gray-600">
                {t('cooperative.loans.approvalNotes')}
              </Paragraph>
              <Paragraph className="whitespace-pre-wrap text-gray-700">
                {loan.approval_notes}
              </Paragraph>
            </div>
          )}

          {loan.rejection_reason && (
            <div>
              <Paragraph className="mb-1 text-sm font-medium text-gray-600">
                {t('cooperative.loans.rejectionReason')}
              </Paragraph>
              <Paragraph className="whitespace-pre-wrap text-gray-700">
                {loan.rejection_reason}
              </Paragraph>
            </div>
          )}

          {loan.disbursement_notes && (
            <div>
              <Paragraph className="mb-1 text-sm font-medium text-gray-600">
                {t('cooperative.loans.form.disbursementNotes')}
              </Paragraph>
              <Paragraph className="whitespace-pre-wrap text-gray-700">
                {loan.disbursement_notes}
              </Paragraph>
            </div>
          )}

          <div>
            <Paragraph className="mb-2 text-sm font-medium text-gray-600">
              {t('cooperative.loans.installments.title')}
            </Paragraph>
            <Table
              dataSource={installments}
              columns={installmentColumns}
              rowKey="id"
              pagination={false}
              size="small"
              scroll={{ x: 900 }}
              locale={{ emptyText: t('cooperative.loans.installments.empty') }}
            />
          </div>
        </div>
      )}
    </Drawer>
  );
}
