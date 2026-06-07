import { useEffect, useMemo } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button, DatePicker, Form, Input, InputNumber, Modal, Select } from 'antd';
import { Controller, useForm } from 'react-hook-form';
import dayjs from '@/lib/dayjs';
import {
  cashBankTransferSchema,
  type CashBankTransferFormData,
  type CashBankTransferFormValues,
} from '@/lib/validations/cashBankTransfer';
import { useI18n } from '@/hooks/useI18n';
import type { ChartOfAccount } from '@/types';

interface CashBankTransferModalProps {
  open: boolean;
  onCancel: () => void;
  accounts: ChartOfAccount[];
  onSubmit: (values: CashBankTransferFormData) => Promise<void>;
  submitting?: boolean;
}

const getDefaultAccountIds = (accounts: ChartOfAccount[]) => {
  const sourceAccount = accounts.find((account) => (
    account.id === 'cash' ||
    account.code === '1010' ||
    account.name.toLowerCase().includes('kas')
  )) ?? accounts[0];
  const destinationAccount = accounts.find((account) => (
    account.id === 'bank' ||
    account.code === '1020' ||
    account.name.toLowerCase().includes('bank') ||
    account.name.toLowerCase().includes('non tunai')
  )) ?? accounts.find((account) => account.id !== sourceAccount?.id);

  return {
    from_cash_account_id: sourceAccount?.id ?? '',
    to_cash_account_id: destinationAccount?.id !== sourceAccount?.id ? destinationAccount?.id ?? '' : '',
  };
};

export default function CashBankTransferModal({
  open,
  onCancel,
  accounts,
  onSubmit,
  submitting = false,
}: CashBankTransferModalProps) {
  const { t } = useI18n();
  const accountOptions = useMemo(() => accounts.map((account) => ({
    value: account.id,
    label: `${account.code} - ${account.name}`,
  })), [accounts]);
  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CashBankTransferFormValues, unknown, CashBankTransferFormData>({
    resolver: zodResolver(cashBankTransferSchema),
    defaultValues: {
      from_cash_account_id: '',
      to_cash_account_id: '',
      amount: undefined as unknown as number,
      transfer_date: new Date().toISOString(),
      payment_channel: '',
      notes: '',
    },
  });

  useEffect(() => {
    if (!open) return;

    reset({
      ...getDefaultAccountIds(accounts),
      amount: undefined as unknown as number,
      transfer_date: new Date().toISOString(),
      payment_channel: '',
      notes: '',
    });
  }, [accounts, open, reset]);

  const handleFormSubmit = async (values: CashBankTransferFormData) => {
    try {
      await onSubmit(values);
      reset({
        ...getDefaultAccountIds(accounts),
        amount: undefined as unknown as number,
        transfer_date: new Date().toISOString(),
        payment_channel: '',
        notes: '',
      });
    } catch {
      // Error feedback is handled by the mutation hook.
    }
  };

  return (
    <Modal
      title={t('finance.transferCashBank')}
      open={open}
      onCancel={onCancel}
      footer={null}
      destroyOnClose
    >
      <Form layout="vertical" component={false}>
        <form className="mt-4" onSubmit={handleSubmit(handleFormSubmit)}>
          <Form.Item
            label={t('finance.transferFromAccount')}
            required
            validateStatus={errors.from_cash_account_id ? 'error' : undefined}
            help={errors.from_cash_account_id?.message}
          >
            <Controller
              control={control}
              name="from_cash_account_id"
              render={({ field }) => (
                <Select
                  {...field}
                  showSearch
                  optionFilterProp="label"
                  placeholder={t('finance.transferAccountPlaceholder')}
                  options={accountOptions}
                />
              )}
            />
          </Form.Item>

          <Form.Item
            label={t('finance.transferToAccount')}
            required
            validateStatus={errors.to_cash_account_id ? 'error' : undefined}
            help={errors.to_cash_account_id?.message}
          >
            <Controller
              control={control}
              name="to_cash_account_id"
              render={({ field }) => (
                <Select
                  {...field}
                  showSearch
                  optionFilterProp="label"
                  placeholder={t('finance.transferAccountPlaceholder')}
                  options={accountOptions}
                />
              )}
            />
          </Form.Item>

          <Form.Item
            label={t('finance.amount')}
            required
            validateStatus={errors.amount ? 'error' : undefined}
            help={errors.amount?.message}
          >
            <Controller
              control={control}
              name="amount"
              render={({ field }) => (
                <InputNumber
                  inputMode="numeric"
                  style={{ width: '100%' }}
                  formatter={(value) => `Rp ${value ?? ''}`.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}
                  parser={(value) => value?.replace(/Rp\s?|(\.*)/g, '') as unknown as number}
                  placeholder="0"
                  size="large"
                  value={field.value}
                  onChange={(value) => field.onChange(value ?? undefined)}
                  onBlur={field.onBlur}
                />
              )}
            />
          </Form.Item>

          <Form.Item
            label={t('finance.transferDate')}
            validateStatus={errors.transfer_date ? 'error' : undefined}
            help={errors.transfer_date?.message}
          >
            <Controller
              control={control}
              name="transfer_date"
              render={({ field }) => (
                <DatePicker
                  style={{ width: '100%' }}
                  value={field.value ? dayjs(field.value) : undefined}
                  onChange={(value) => field.onChange(value?.toISOString() ?? undefined)}
                  onBlur={field.onBlur}
                />
              )}
            />
          </Form.Item>

          <Form.Item
            label={t('finance.paymentChannel')}
            validateStatus={errors.payment_channel ? 'error' : undefined}
            help={errors.payment_channel?.message}
          >
            <Controller
              control={control}
              name="payment_channel"
              render={({ field }) => (
                <Input {...field} value={field.value ?? ''} placeholder={t('finance.paymentChannelPlaceholder')} />
              )}
            />
          </Form.Item>

          <Form.Item
            label={t('finance.transferNotes')}
            validateStatus={errors.notes ? 'error' : undefined}
            help={errors.notes?.message}
          >
            <Controller
              control={control}
              name="notes"
              render={({ field }) => (
                <Input.TextArea {...field} value={field.value ?? ''} rows={3} placeholder={t('finance.transferNotesPlaceholder')} />
              )}
            />
          </Form.Item>

          <div className="mt-6 flex justify-end gap-2">
            <Button onClick={onCancel}>
              {t('common.cancel')}
            </Button>
            <Button type="primary" htmlType="submit" loading={submitting}>
              {t('finance.transfer')}
            </Button>
          </div>
        </form>
      </Form>
    </Modal>
  );
}
