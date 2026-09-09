import { useContext } from 'react';
import { Alert, Button, Tag, Typography } from 'antd';
import { ArrowRight } from 'lucide-react';
import { useI18n } from '@/hooks/useI18n';
import { PLAN_NAMES } from './catalog';
import { remainingDays, reminderDate } from './contract';
import { updateSubscription } from './storage';
import { SubscriptionContext } from './SubscriptionContext';

export function SubscriptionProfile({ onManage }: { onManage: () => void }) {
  const context = useContext(SubscriptionContext);
  const { t, locale } = useI18n();
  if (!context) return null;
  const { subscription, now, openManage } = context;
  const trial = subscription.access.kind === 'trial';
  const date = new Date(subscription.access.end).toLocaleDateString(
    locale === 'id' ? 'id-ID' : 'en-GB',
    { day: 'numeric', month: 'short', year: 'numeric' },
  );
  return (
    <section
      aria-label={t('subscription.title')}
      className="mb-2 rounded-lg border border-blue-100 bg-blue-50 px-3 pt-3 dark:border-blue-900 dark:bg-blue-950/30"
    >
      <div className="flex items-start justify-between gap-2">
        <Typography.Text strong className="min-w-0">
          {PLAN_NAMES[subscription.access.plan]}
        </Typography.Text>
        <Tag color={trial ? 'blue' : 'green'} className="!m-0">
          {t(trial ? 'subscription.trial' : 'subscription.active')}
        </Tag>
      </div>
      <Typography.Text type="secondary" className="mt-1 block !text-xs dark:!text-gray-400">
        {t('subscription.validUntil', { date })}
      </Typography.Text>
      {trial && (
        <Typography.Text type="secondary" className="block !text-xs dark:!text-gray-400">
          {t('subscription.trialDays', {
            days: remainingDays(subscription.access, now),
          })}
        </Typography.Text>
      )}
      <Button
        type="link"
        block
        className="!flex !h-11 !items-center !justify-between !px-0 !text-sm dark:!text-blue-400 dark:hover:!text-blue-300"
        onClick={() => {
          onManage();
          openManage();
        }}
      >
        {t(trial ? 'subscription.upgrade' : 'subscription.manage')}
        <ArrowRight size={16} className="shrink-0" aria-hidden="true" />
      </Button>
    </section>
  );
}

export function SubscriptionReminder() {
  const context = useContext(SubscriptionContext);
  const { t } = useI18n();
  if (!context) return null;
  const { subscription, now, openManage } = context;
  const today = new Date(now);
  const key = `${today.getFullYear()}-${today.getMonth() + 1}-${today.getDate()}`;
  const days = remainingDays(subscription.access, now);
  const trial = subscription.access.kind === 'trial';
  const nearExpiry = days <= 7;
  const paidToday =
    !trial &&
    new Date(subscription.access.start).toDateString() === today.toDateString();
  if (
    subscription.reminderDismissed === key ||
    (!nearExpiry && (!reminderDate(today) || paidToday))
  )
    return null;

  return (
    <Alert
      className="mb-4"
      type={nearExpiry ? 'warning' : 'info'}
      showIcon
      closable
      onClose={() => updateSubscription({ reminderDismissed: key })}
      title={t(
        nearExpiry
          ? 'subscription.expiryReminder'
          : 'subscription.weeklyReminder',
        { days },
      )}
      description={
        <Button size="small" onClick={openManage}>
          {t(trial ? 'subscription.upgrade' : 'subscription.renew')}
        </Button>
      }
    />
  );
}
