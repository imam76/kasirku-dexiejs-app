import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { Alert, App, Button, Card, DatePicker, Descriptions, Form, Select, Space, Tag, Typography } from 'antd';
import type { Dayjs } from 'dayjs';
import { BookOpen, CalendarClock } from 'lucide-react';
import dayjs from '@/lib/dayjs';
import { db } from '@/lib/db';
import { useAuth } from '@/auth/useAuth';
import { useI18n } from '@/hooks/useI18n';
import { saveAccountingReferenceSetting } from '@/services/accountingReferenceSettingService';
import { formatDateOnly } from '@/utils/formatters';
import type { AccountingPeriod, AccountingPeriodStatus, InventoryAccountingPolicy } from '@/types';

const { Paragraph, Text } = Typography;
const { RangePicker } = DatePicker;

interface AccountingReferenceFormValues {
  cutoff_date?: Dayjs;
  inventory_policy: InventoryAccountingPolicy;
  period_range?: [Dayjs, Dayjs];
}

const statusColor: Record<AccountingPeriodStatus, string> = {
  OPEN: 'green',
  LOCKED: 'gold',
  CLOSED: 'red',
};

const toDateOnly = (value: string) => value.slice(0, 10);

const sortLatestFirst = (periods: AccountingPeriod[]) => (
  periods
    .filter((period) => !period.deleted_at)
    .sort((a, b) => (a.start_date < b.start_date ? 1 : -1))
);

const getReferencePeriod = (periods: AccountingPeriod[]) => {
  const sortedPeriods = sortLatestFirst(periods);
  const today = dayjs().format('YYYY-MM-DD');

  return sortedPeriods.find((period) => (
    toDateOnly(period.start_date) <= today && today <= toDateOnly(period.end_date)
  )) ?? sortedPeriods.find((period) => period.status === 'OPEN') ?? sortedPeriods[0];
};

export default function AccountingDateSettingsCard() {
  const { t } = useI18n();
  const { can } = useAuth();
  const navigate = useNavigate();
  const { message, modal } = App.useApp();
  const [form] = Form.useForm<AccountingReferenceFormValues>();
  const [saving, setSaving] = useState(false);

  const canManagePeriod = can('ACCOUNTING_PERIOD_MANAGE');
  const canOpenLedger = can('FINANCE_ACCESS');
  const generalLedgerSetting = useLiveQuery(
    () => db.generalLedgerSetting.get('default'),
    [],
    undefined,
  );
  const periods = useLiveQuery(
    () => db.accountingPeriods.toArray(),
    [],
    [] as AccountingPeriod[],
  );
  const referencePeriod = useMemo(() => getReferencePeriod(periods ?? []), [periods]);
  const cutoffLocked = Boolean(generalLedgerSetting?.opening_balance_journal_id);

  useEffect(() => {
    form.setFieldsValue({
      cutoff_date: generalLedgerSetting?.cutoff_date
        ? dayjs(generalLedgerSetting.cutoff_date)
        : undefined,
      inventory_policy: generalLedgerSetting?.inventory_policy ?? 'PERPETUAL_INVENTORY',
      period_range: referencePeriod
        ? [dayjs(referencePeriod.start_date), dayjs(referencePeriod.end_date)]
        : [dayjs().startOf('year'), dayjs().endOf('year')],
    });
  }, [
    form,
    generalLedgerSetting?.cutoff_date,
    generalLedgerSetting?.inventory_policy,
    referencePeriod?.id,
    referencePeriod?.updated_at,
  ]);

  const handleSave = async (values: AccountingReferenceFormValues) => {
    if (!values.cutoff_date || !values.period_range?.[0] || !values.period_range?.[1]) {
      message.warning(t('settings.accountingReferenceRequired'));
      return;
    }

    try {
      setSaving(true);
      await saveAccountingReferenceSetting({
        cutoff_date: values.cutoff_date.format('YYYY-MM-DD'),
        inventory_policy: values.inventory_policy,
        period_start: values.period_range[0].format('YYYY-MM-DD'),
        period_end: values.period_range[1].format('YYYY-MM-DD'),
      });
      message.success(t('settings.accountingReferenceSaved'));
    } catch (error) {
      modal.error({
        title: t('settings.accountingReferenceSaveFailed'),
        content: error instanceof Error ? error.message : t('common.unknownError'),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card
      title={(
        <div className="flex min-w-0 items-center gap-2">
          <CalendarClock className="h-5 w-5 shrink-0" />
          {t('settings.accountingDateTitle')}
        </div>
      )}
      className="shadow-md"
    >
      <div className="space-y-4">
        <Paragraph className="!mb-0 text-gray-600">
          {t('settings.accountingDateDescription')}
        </Paragraph>

        {cutoffLocked && (
          <Alert
            type="info"
            showIcon
            message={t('settings.accountingLockedWarning')}
          />
        )}

        {!canManagePeriod && (
          <Alert
            type="warning"
            showIcon
            message={t('settings.accountingPermissionWarning')}
          />
        )}

        <Form<AccountingReferenceFormValues>
          form={form}
          layout="vertical"
          onFinish={handleSave}
        >
          <div className="grid gap-3 md:grid-cols-3">
            <Form.Item
              name="cutoff_date"
              label={t('settings.accountingCutoff')}
              rules={[{ required: true, message: t('settings.accountingReferenceRequired') }]}
            >
              <DatePicker
                className="w-full"
                format="YYYY-MM-DD"
                disabled={!canManagePeriod || cutoffLocked}
              />
            </Form.Item>

            <Form.Item
              name="period_range"
              label={t('settings.accountingFiscalPeriod')}
              rules={[{ required: true, message: t('settings.accountingReferenceRequired') }]}
            >
              <RangePicker
                className="w-full"
                format="YYYY-MM-DD"
                disabled={!canManagePeriod}
              />
            </Form.Item>

            <Form.Item
              name="inventory_policy"
              label={t('settings.accountingInventoryPolicy')}
              rules={[{ required: true }]}
            >
              <Select
                disabled={!canManagePeriod || cutoffLocked}
                options={[
                  {
                    value: 'PERPETUAL_INVENTORY',
                    label: t('generalLedger.inventoryPolicy.perpetual'),
                  },
                  {
                    value: 'CASH_FLOW_ONLY',
                    label: t('generalLedger.inventoryPolicy.cashFlowOnly'),
                  },
                ]}
              />
            </Form.Item>
          </div>

          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <Space wrap>
              <Button
                type="primary"
                htmlType="submit"
                loading={saving}
                disabled={!canManagePeriod}
              >
                {t('settings.accountingSaveReference')}
              </Button>
              {canManagePeriod && (
                <Button
                  icon={<BookOpen className="h-4 w-4" />}
                  onClick={() => navigate({ to: '/finance/closing' })}
                >
                  {t('settings.accountingManageClosing')}
                </Button>
              )}
              {canOpenLedger && (
                <Button onClick={() => navigate({ to: '/finance/general-ledger/setup' })}>
                  {t('settings.accountingOpenLedgerSetup')}
                </Button>
              )}
            </Space>

            <Text type="secondary">
              {generalLedgerSetting?.cutoff_date
                ? `${t('settings.accountingCutoff')}: ${formatDateOnly(generalLedgerSetting.cutoff_date)}`
                : t('settings.accountingNoCutoff')}
            </Text>
          </div>
        </Form>

        <Descriptions size="small" column={{ xs: 1, md: 3 }}>
          <Descriptions.Item label={t('settings.accountingCurrentPeriod')}>
            {referencePeriod ? referencePeriod.name : t('settings.accountingNoCurrentPeriod')}
          </Descriptions.Item>
          <Descriptions.Item label={t('settings.accountingFiscalPeriod')}>
            {referencePeriod
              ? `${formatDateOnly(referencePeriod.start_date)} - ${formatDateOnly(referencePeriod.end_date)}`
              : '-'}
          </Descriptions.Item>
          <Descriptions.Item label={t('settings.accountingPeriodStatus')}>
            {referencePeriod ? (
              <Tag color={statusColor[referencePeriod.status]}>
                {t(`closing.status.${referencePeriod.status}`)}
              </Tag>
            ) : '-'}
          </Descriptions.Item>
        </Descriptions>
      </div>
    </Card>
  );
}
