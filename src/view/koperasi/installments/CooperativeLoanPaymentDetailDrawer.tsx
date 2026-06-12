import { Descriptions, Drawer, Tag, Typography } from 'antd';
import { useI18n } from '@/hooks/useI18n';
import type { CooperativeLoanPayment, CooperativeLoanPaymentStatus } from '@/types';
import { formatCurrency, formatDate } from '@/utils/formatters';

const { Paragraph } = Typography;

interface CooperativeLoanPaymentDetailDrawerProps {
  payment: CooperativeLoanPayment | null;
  open: boolean;
  onClose: () => void;
}

export default function CooperativeLoanPaymentDetailDrawer({
  payment,
  open,
  onClose,
}: CooperativeLoanPaymentDetailDrawerProps) {
  const { t } = useI18n();
  const statusLabels: Record<CooperativeLoanPaymentStatus, string> = {
    POSTED: t('cooperative.installments.paymentStatus.posted'),
    REVERSED: t('cooperative.installments.paymentStatus.reversed'),
  };

  return (
    <Drawer
      title={payment ? `${payment.payment_number} - ${payment.member_name}` : t('cooperative.installments.paymentDetailTitle')}
      open={open}
      onClose={onClose}
      width={560}
      destroyOnHidden
    >
      {payment && (
        <div className="space-y-5">
          <Descriptions column={1} size="small" bordered>
            <Descriptions.Item label={t('cooperative.installments.payments.status')}>
              <Tag color={payment.status === 'POSTED' ? 'green' : 'red'}>{statusLabels[payment.status]}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label={t('cooperative.installments.paymentType.title')}>
              {payment.payment_type === 'REVERSAL'
                ? t('cooperative.installments.paymentType.reversal')
                : t('cooperative.installments.paymentType.payment')}
            </Descriptions.Item>
            <Descriptions.Item label={t('cooperative.installments.payments.paymentNumber')}>
              {payment.payment_number}
            </Descriptions.Item>
            <Descriptions.Item label={t('cooperative.installments.payments.paymentDate')}>
              {formatDate(payment.payment_date)}
            </Descriptions.Item>
            <Descriptions.Item label={t('cooperative.installments.payments.postedAt')}>
              {payment.posted_at ? formatDate(payment.posted_at) : '-'}
            </Descriptions.Item>
            <Descriptions.Item label={t('cooperative.installments.table.loan')}>
              {payment.loan_number}
            </Descriptions.Item>
            <Descriptions.Item label={t('cooperative.loans.table.member')}>
              {payment.member_number} - {payment.member_name}
            </Descriptions.Item>
            <Descriptions.Item label={t('cooperative.installments.payments.amount')}>
              Rp {formatCurrency(payment.amount)}
            </Descriptions.Item>
            <Descriptions.Item label={t('cooperative.installments.installments.penaltyShort')}>
              Rp {formatCurrency(payment.penalty_amount)}
            </Descriptions.Item>
            <Descriptions.Item label={t('cooperative.installments.installments.interestShort')}>
              Rp {formatCurrency(payment.interest_amount)}
            </Descriptions.Item>
            <Descriptions.Item label={t('cooperative.installments.installments.principalShort')}>
              Rp {formatCurrency(payment.principal_amount)}
            </Descriptions.Item>
            <Descriptions.Item label={t('finance.cashAccount')}>
              {payment.cash_account_code && payment.cash_account_name
                ? `${payment.cash_account_code} - ${payment.cash_account_name}`
                : '-'}
            </Descriptions.Item>
            <Descriptions.Item label={t('checkout.method')}>
              {payment.payment_method === 'NON_TUNAI' ? t('payment.nonCash') : payment.payment_method === 'TUNAI' ? t('payment.cash') : '-'}
            </Descriptions.Item>
            <Descriptions.Item label={t('finance.paymentChannel')}>
              {payment.payment_channel || '-'}
            </Descriptions.Item>
            <Descriptions.Item label={t('cooperative.installments.payments.collector')}>
              {payment.collector_name || '-'}
            </Descriptions.Item>
            <Descriptions.Item label={t('cooperative.installments.payments.receivedBy')}>
              {payment.received_by_name || '-'}
            </Descriptions.Item>
            <Descriptions.Item label={t('cooperative.savings.financeTransaction')}>
              {payment.finance_transaction_id || '-'}
            </Descriptions.Item>
            <Descriptions.Item label={t('cooperative.savings.journalEntry')}>
              {payment.journal_entry_id || '-'}
            </Descriptions.Item>
            <Descriptions.Item label={t('cooperative.installments.reversalOf')}>
              {payment.reversal_of_payment_id || '-'}
            </Descriptions.Item>
            <Descriptions.Item label={t('cooperative.installments.reversalPayment')}>
              {payment.reversal_payment_id || '-'}
            </Descriptions.Item>
            <Descriptions.Item label={t('cooperative.members.detail.createdBy')}>
              {payment.created_by_name || '-'}
            </Descriptions.Item>
            <Descriptions.Item label={t('cooperative.members.detail.updatedBy')}>
              {payment.updated_by_name || '-'}
            </Descriptions.Item>
          </Descriptions>

          <div>
            <Paragraph className="mb-1 text-sm font-medium text-gray-600">
              {t('cooperative.installments.form.notes')}
            </Paragraph>
            <Paragraph className="whitespace-pre-wrap text-gray-700">
              {payment.notes || '-'}
            </Paragraph>
          </div>

          {payment.reversal_reason && (
            <div>
              <Paragraph className="mb-1 text-sm font-medium text-gray-600">
                {t('cooperative.installments.reversalReason')}
              </Paragraph>
              <Paragraph className="whitespace-pre-wrap text-gray-700">
                {payment.reversal_reason}
              </Paragraph>
            </div>
          )}
        </div>
      )}
    </Drawer>
  );
}
