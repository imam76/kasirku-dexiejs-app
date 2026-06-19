import { Button, Descriptions, Drawer, Empty, Space, Tag, Timeline, Typography } from 'antd';
import { CalendarClock, CreditCard } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useI18n } from '@/hooks/useI18n';
import { db } from '@/lib/db';
import type {
  CooperativeLoan,
  CooperativeLoanCollectionEvent,
  CooperativeLoanInstallment,
  CooperativeLoanInstallmentCollectionStatus,
} from '@/types';
import { formatCurrency, formatDate } from '@/utils/formatters';
import { getInstallmentRemainingAmounts } from '@/utils/koperasi/loanPaymentAllocation';
import { cooperativeLoanBillingFrequencyOptions } from '../loans/loanOptions';

const { Text } = Typography;

interface CooperativeBillingDrawerProps {
  installment: CooperativeLoanInstallment | null;
  loan: CooperativeLoan | undefined;
  open: boolean;
  onClose: () => void;
  onPay: (installment: CooperativeLoanInstallment) => void;
  onCollect: (installment: CooperativeLoanInstallment) => void;
  canPay?: boolean;
  canCollect?: boolean;
}

export default function CooperativeBillingDrawer({
  installment,
  loan,
  open,
  onClose,
  onPay,
  onCollect,
  canPay = true,
  canCollect = true,
}: CooperativeBillingDrawerProps) {
  const { t } = useI18n();
  const collectionEvents = useLiveQuery(
    () => installment
      ? db.cooperativeLoanCollectionEvents
        .where('installment_id')
        .equals(installment.id)
        .reverse()
        .sortBy('contacted_at')
      : Promise.resolve([] as CooperativeLoanCollectionEvent[]),
    [installment?.id],
    [] as CooperativeLoanCollectionEvent[],
  );

  if (!installment || !loan) {
    return (
      <Drawer open={open} onClose={onClose} width={400} />
    );
  }

  const remaining = getInstallmentRemainingAmounts(installment);
  const collectionStatus = installment.collection_status ?? 'NONE';
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
  const billingFrequencyLabels = cooperativeLoanBillingFrequencyOptions.reduce<Record<string, string>>((acc, option) => {
    acc[option.value] = t(option.labelKey);
    return acc;
  }, {});

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
            icon={<CalendarClock size={16} />}
            disabled={!canCollect || installment.status === 'PAID' || loan.status !== 'DISBURSED'}
            onClick={() => {
              onClose();
              onCollect(installment);
            }}
          >
            {t('cooperative.billing.collect')}
          </Button>
          <Button
            type="primary"
            icon={<CreditCard size={16} />}
            disabled={!canPay || installment.status === 'PAID' || loan.status !== 'DISBURSED'}
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
            <Descriptions.Item label={t('cooperative.loans.form.billingFrequency')}>
              {billingFrequencyLabels[loan.billing_frequency ?? 'MONTHLY']}
            </Descriptions.Item>
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
            <Descriptions.Item label={t('cooperative.billing.table.collection')}>
              <Tag color={collectionStatusColors[collectionStatus]}>{collectionStatusLabels[collectionStatus]}</Tag>
            </Descriptions.Item>
            {installment.follow_up_date && (
              <Descriptions.Item label={t('cooperative.billing.collection.followUpDate')}>
                {formatDate(installment.follow_up_date)}
              </Descriptions.Item>
            )}
            {installment.collection_notes && (
              <Descriptions.Item label={t('cooperative.billing.collection.notes')}>
                {installment.collection_notes}
              </Descriptions.Item>
            )}
          </Descriptions>
        </div>

        <div>
          <Text strong className="mb-2 block text-gray-500">Riwayat Penagihan</Text>
          {collectionEvents.length === 0 ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Belum ada riwayat penagihan" />
          ) : (
            <Timeline
              items={collectionEvents.map((event) => ({
                children: (
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Tag color={collectionStatusColors[event.collection_status]}>
                        {collectionStatusLabels[event.collection_status]}
                      </Tag>
                      <Text type="secondary">{formatDate(event.contacted_at)}</Text>
                    </div>
                    <div className="mt-1 whitespace-pre-wrap">{event.collection_notes}</div>
                    <Text type="secondary" className="text-xs">
                      {event.actor_user_name ?? 'Petugas tidak diketahui'}
                    </Text>
                  </div>
                ),
              }))}
            />
          )}
        </div>
      </div>
    </Drawer>
  );
}
