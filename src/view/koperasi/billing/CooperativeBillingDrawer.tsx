import { Button, Descriptions, Drawer, Space, Typography } from 'antd';
import { CreditCard } from 'lucide-react';
import { useI18n } from '@/hooks/useI18n';
import type { CooperativeLoan, CooperativeLoanInstallment } from '@/types';
import { formatCurrency, formatDate } from '@/utils/formatters';
import { getInstallmentRemainingAmounts } from '@/utils/koperasi/loanPaymentAllocation';

const { Text } = Typography;

interface CooperativeBillingDrawerProps {
  installment: CooperativeLoanInstallment | null;
  loan: CooperativeLoan | undefined;
  open: boolean;
  onClose: () => void;
  onPay: (installment: CooperativeLoanInstallment) => void;
}

export default function CooperativeBillingDrawer({
  installment,
  loan,
  open,
  onClose,
  onPay,
}: CooperativeBillingDrawerProps) {
  const { t } = useI18n();

  if (!installment || !loan) {
    return (
      <Drawer open={open} onClose={onClose} width={400} />
    );
  }

  const remaining = getInstallmentRemainingAmounts(installment);

  return (
    <Drawer
      title={t('cooperative.billing.drawer.title')}
      open={open}
      onClose={onClose}
      width={400}
      footer={(
        <Space className="w-full justify-end">
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            type="primary"
            icon={<CreditCard size={16} />}
            disabled={installment.status === 'PAID' || loan.status !== 'DISBURSED'}
            onClick={() => {
              onClose();
              onPay(installment);
            }}
          >
            {t('cooperative.billing.pay')}
          </Button>
        </Space>
      )}
    >
      <div className="space-y-6">
        <div>
          <Text strong className="mb-2 block text-gray-500">{t('cooperative.billing.drawer.memberInfo')}</Text>
          <Descriptions column={1} size="small" bordered>
            <Descriptions.Item label={t('cooperative.billing.table.member')}>{installment.member_name}</Descriptions.Item>
            <Descriptions.Item label="No. Anggota">{installment.member_number}</Descriptions.Item>
          </Descriptions>
        </div>

        <div>
          <Text strong className="mb-2 block text-gray-500">{t('cooperative.billing.drawer.loanInfo')}</Text>
          <Descriptions column={1} size="small" bordered>
            <Descriptions.Item label={t('cooperative.billing.table.loan')}>{loan.loan_number}</Descriptions.Item>
            <Descriptions.Item label="Pokok Awal">Rp {formatCurrency(loan.principal_amount)}</Descriptions.Item>
            <Descriptions.Item label={t('cooperative.billing.drawer.outstandingTotal')}>Rp {formatCurrency(loan.outstanding_principal_amount + loan.outstanding_interest_amount + loan.outstanding_penalty_amount)}</Descriptions.Item>
          </Descriptions>
        </div>

        <div>
          <Text strong className="mb-2 block text-gray-500">{t('cooperative.installments.form.installment')}</Text>
          <Descriptions column={1} size="small" bordered>
            <Descriptions.Item label={t('cooperative.billing.table.installmentNo')}>{installment.installment_number}</Descriptions.Item>
            <Descriptions.Item label={t('cooperative.billing.table.dueDate')}>{formatDate(installment.due_date)}</Descriptions.Item>
            <Descriptions.Item label={t('cooperative.billing.table.bill')}>Rp {formatCurrency(installment.principal_amount + installment.interest_amount + installment.penalty_amount)}</Descriptions.Item>
            <Descriptions.Item label={t('cooperative.installments.table.paid')}>Rp {formatCurrency(installment.paid_principal_amount + installment.paid_interest_amount + installment.paid_penalty_amount)}</Descriptions.Item>
            <Descriptions.Item label={t('cooperative.billing.table.remaining')}>Rp {formatCurrency(remaining.total_amount)}</Descriptions.Item>
          </Descriptions>
        </div>
      </div>
    </Drawer>
  );
}
