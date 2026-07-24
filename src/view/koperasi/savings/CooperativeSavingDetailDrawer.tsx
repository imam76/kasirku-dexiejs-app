import { Descriptions, Drawer, Tag, Typography } from 'antd';
import { useI18n } from '@/hooks/useI18n';
import type { CooperativeSavingTransaction, CooperativeSavingTransactionStatus, CooperativeSavingType } from '@/types';
import { formatCurrency, formatDate } from '@/utils/formatters';
import {
  cooperativeSavingStatusOptions,
  cooperativeSavingTransactionTypeOptions,
  cooperativeSavingTypeOptions,
} from './savingOptions';

const { Paragraph } = Typography;

interface CooperativeSavingDetailDrawerProps {
  transaction: CooperativeSavingTransaction | null;
  open: boolean;
  onClose: () => void;
}

export default function CooperativeSavingDetailDrawer({
  transaction,
  open,
  onClose,
}: CooperativeSavingDetailDrawerProps) {
  const { t } = useI18n();
  const savingTypeLabels = cooperativeSavingTypeOptions.reduce<Record<CooperativeSavingType, string>>((acc, option) => {
    acc[option.value] = t(option.labelKey);
    return acc;
  }, {} as Record<CooperativeSavingType, string>);
  const transactionTypeLabels = cooperativeSavingTransactionTypeOptions.reduce<Record<string, string>>((acc, option) => {
    acc[option.value] = t(option.labelKey);
    return acc;
  }, {
    REVERSAL: t('cooperative.savings.transactionType.reversal'),
  });
  const statusLabels = cooperativeSavingStatusOptions.reduce<Record<CooperativeSavingTransactionStatus, string>>((acc, option) => {
    acc[option.value] = t(option.labelKey);
    return acc;
  }, {} as Record<CooperativeSavingTransactionStatus, string>);
  const savingTypeOption = transaction
    ? cooperativeSavingTypeOptions.find((option) => option.value === transaction.saving_type)
    : undefined;
  const statusOption = transaction
    ? cooperativeSavingStatusOptions.find((option) => option.value === transaction.status)
    : undefined;

  return (
    <Drawer
      title={transaction ? `${transaction.member_number} - ${transaction.member_name}` : t('cooperative.savings.detailTitle')}
      open={open}
      onClose={onClose}
      width={560}
      destroyOnHidden
    >
      {transaction && (
        <div className="space-y-5">
          <Descriptions column={1} size="small" bordered>
            <Descriptions.Item label={t('cooperative.savings.table.status')}>
              <Tag color={statusOption?.color}>{statusLabels[transaction.status]}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label={t('cooperative.savings.table.date')}>
              {formatDate(transaction.transaction_date)}
            </Descriptions.Item>
            <Descriptions.Item label={t('cooperative.savings.table.savingType')}>
              <Tag color={savingTypeOption?.color}>{savingTypeLabels[transaction.saving_type]}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label={t('cooperative.savings.table.transactionType')}>
              {transactionTypeLabels[transaction.transaction_type]}
            </Descriptions.Item>
            {transaction.transaction_type === 'WITHDRAWAL' && (
              <Descriptions.Item label={t('cooperative.savings.form.withdrawalSource')}>
                {transaction.withdrawal_source === 'INTEREST'
                  ? t('cooperative.savings.withdrawalSource.interest')
                  : t('cooperative.savings.withdrawalSource.saving')}
              </Descriptions.Item>
            )}
            {transaction.withdrawal_source === 'INTEREST' && (
              <Descriptions.Item label={t('cooperative.savings.interestRate')}>
                {transaction.interest_rate_per_month ?? 0.2}% per bulan
              </Descriptions.Item>
            )}
            <Descriptions.Item label={t('cooperative.savings.table.amount')}>
              Rp {formatCurrency(transaction.amount)}
            </Descriptions.Item>
            {transaction.transaction_type === 'OPENING_BALANCE' && (
              <>
                <Descriptions.Item label={t('cooperative.savings.openingBalance.interestAmount')}>
                  Rp {formatCurrency(Number(transaction.opening_interest_amount || 0))}
                </Descriptions.Item>
                <Descriptions.Item label={t('cooperative.savings.openingBalance.totalEntitlement')}>
                  Rp {formatCurrency(
                    Number(transaction.amount || 0) + Number(transaction.opening_interest_amount || 0),
                  )}
                </Descriptions.Item>
              </>
            )}
            {transaction.withdrawal_source === 'INTEREST' && (
              <Descriptions.Item label={t('cooperative.savings.openingBalance.historicalInterestApplied')}>
                Rp {formatCurrency(Number(transaction.opening_interest_applied_amount || 0))}
              </Descriptions.Item>
            )}
            <Descriptions.Item label={t('finance.cashAccount')}>
              {transaction.cash_account_code && transaction.cash_account_name
                ? `${transaction.cash_account_code} - ${transaction.cash_account_name}`
                : '-'}
            </Descriptions.Item>
            <Descriptions.Item label={t('checkout.method')}>
              {transaction.payment_method
                ? transaction.payment_method === 'NON_TUNAI' ? t('payment.nonCash') : t('payment.cash')
                : '-'}
            </Descriptions.Item>
            <Descriptions.Item label={t('finance.paymentChannel')}>
              {transaction.payment_channel || '-'}
            </Descriptions.Item>
            <Descriptions.Item label={t('cooperative.savings.financeTransaction')}>
              {transaction.finance_transaction_id || '-'}
            </Descriptions.Item>
            <Descriptions.Item label={t('cooperative.savings.journalEntry')}>
              {transaction.journal_entry_id || '-'}
            </Descriptions.Item>
            <Descriptions.Item label={t('cooperative.savings.reversalOf')}>
              {transaction.reversal_of_transaction_id || '-'}
            </Descriptions.Item>
            <Descriptions.Item label={t('cooperative.savings.reversalTransaction')}>
              {transaction.reversal_transaction_id || '-'}
            </Descriptions.Item>
            <Descriptions.Item label={t('cooperative.members.detail.createdBy')}>
              {transaction.created_by_name || '-'}
            </Descriptions.Item>
            <Descriptions.Item label={t('cooperative.members.detail.updatedBy')}>
              {transaction.updated_by_name || '-'}
            </Descriptions.Item>
          </Descriptions>

          <div>
            <Paragraph className="mb-1 text-sm font-medium text-gray-600">
              {t('cooperative.savings.form.notes')}
            </Paragraph>
            <Paragraph className="whitespace-pre-wrap text-gray-700">
              {transaction.notes || '-'}
            </Paragraph>
          </div>

          {transaction.reversal_reason && (
            <div>
              <Paragraph className="mb-1 text-sm font-medium text-gray-600">
                {t('cooperative.savings.reversalReason')}
              </Paragraph>
              <Paragraph className="whitespace-pre-wrap text-gray-700">
                {transaction.reversal_reason}
              </Paragraph>
            </div>
          )}
        </div>
      )}
    </Drawer>
  );
}
