import { useEffect, useMemo } from 'react';
import { Button, Form, Input, InputNumber, Modal, Select } from 'antd';
import { FINANCE_CATEGORIES } from '@/constants/finance';
import { useI18n } from '@/hooks/useI18n';
import type { ChartOfAccount, FinanceTransactionType, PaymentMethod } from '@/types';

const { Option } = Select;

export interface FinanceTransactionFormValues {
  amount: number;
  category: string;
  description: string;
  payment_method: PaymentMethod;
  payment_channel?: string;
  cash_account_id?: string;
}

interface FinanceTransactionModalProps {
  open: boolean;
  type: FinanceTransactionType;
  accounts: ChartOfAccount[];
  onCancel: () => void;
  onSubmit: (values: FinanceTransactionFormValues) => Promise<void>;
  submitting?: boolean;
}

const getDefaultCashAccountId = (
  accounts: ChartOfAccount[],
  paymentMethod: PaymentMethod,
) => {
  const preferredId = paymentMethod === 'NON_TUNAI' ? 'bank' : 'cash';
  const preferredCode = paymentMethod === 'NON_TUNAI' ? '1020' : '1010';
  const preferredAccount = accounts.find((account) => (
    account.id === preferredId || account.code === preferredCode
  ));

  return preferredAccount?.id ?? accounts[0]?.id;
};

export default function FinanceTransactionModal({
  open,
  type,
  accounts,
  onCancel,
  onSubmit,
  submitting = false,
}: FinanceTransactionModalProps) {
  const { t } = useI18n();
  const [form] = Form.useForm<FinanceTransactionFormValues>();
  const cashBankAccountOptions = useMemo(() => (
    accounts.map((account) => ({
      value: account.id,
      label: `${account.code} - ${account.name}`,
    }))
  ), [accounts]);

  useEffect(() => {
    if (!open) return;

    const defaultValues: Partial<FinanceTransactionFormValues> = {
      payment_method: 'TUNAI',
      cash_account_id: getDefaultCashAccountId(accounts, 'TUNAI'),
      payment_channel: undefined,
    };

    if (type === 'OPENING_BALANCE') {
      defaultValues.category = FINANCE_CATEGORIES.OPENING_BALANCE;
      defaultValues.description = t('finance.defaultOpeningDescription');
    } else if (type === 'INCOME') {
      defaultValues.category = FINANCE_CATEGORIES.OTHER;
      defaultValues.description = '';
    } else if (type === 'EXPENSE') {
      defaultValues.category = FINANCE_CATEGORIES.OPERATIONAL;
      defaultValues.description = '';
    }

    form.setFieldsValue(defaultValues);
  }, [accounts, form, open, t, type]);

  const handlePaymentMethodChange = (paymentMethod: PaymentMethod) => {
    form.setFieldsValue({
      cash_account_id: getDefaultCashAccountId(accounts, paymentMethod),
    });
  };

  const handleFinish = async (values: FinanceTransactionFormValues) => {
    try {
      await onSubmit(values);
      form.resetFields();
    } catch {
      // Error feedback is handled by the mutation hook.
    }
  };

  return (
    <Modal
      title={
        type === 'OPENING_BALANCE' ? t('finance.addBalanceCapital') :
          type === 'INCOME' ? t('finance.addManualIncome') :
            t('finance.recordExpense')
      }
      open={open}
      onCancel={onCancel}
      footer={null}
      destroyOnClose
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={handleFinish}
        className="mt-4"
      >
        <Form.Item
          name="amount"
          label={t('finance.amount')}
          rules={[
            { required: true, message: t('finance.amountRequired') },
            { type: 'number', min: 1, message: t('finance.amountMin') },
          ]}
        >
          <InputNumber
            inputMode="numeric"
            style={{ width: '100%' }}
            formatter={(value) => `Rp ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}
            parser={(value) => value?.replace(/Rp\s?|(\.*)/g, '') as unknown as number}
            placeholder="0"
            size="large"
            autoFocus
          />
        </Form.Item>

        <Form.Item
          name="category"
          label={t('finance.category')}
          rules={[{ required: true, message: t('finance.categoryRequired') }]}
        >
          {type === 'OPENING_BALANCE' ? (
            <Select showSearch placeholder={t('finance.balanceSourcePlaceholder')}>
              <Option value={FINANCE_CATEGORIES.OPENING_BALANCE}>{t('finance.category.SALDO_AWAL')}</Option>
              <Option value={FINANCE_CATEGORIES.CAPITAL_ADDITION}>{t('finance.category.TAMBAHAN_MODAL')}</Option>
              <Option value={FINANCE_CATEGORIES.DEPOSIT}>{t('finance.category.DEPOSIT')}</Option>
              <Option value={FINANCE_CATEGORIES.LOAN}>{t('finance.category.PINJAMAN')}</Option>
            </Select>
          ) : (
            <Select showSearch allowClear placeholder={t('finance.categoryPlaceholder')}>
              {type === 'INCOME' ? (
                <>
                  <Option value={FINANCE_CATEGORIES.OTHER}>{t('finance.category.LAINNYA')}</Option>
                  <Option value={FINANCE_CATEGORIES.SERVICE}>{t('finance.category.LAYANAN')}</Option>
                  <Option value={FINANCE_CATEGORIES.BONUS_GRANT}>{t('finance.category.BONUS')}</Option>
                </>
              ) : (
                <>
                  <Option value={FINANCE_CATEGORIES.STOCK_PURCHASE}>{t('finance.category.stockPurchaseOption')}</Option>
                  <Option value={FINANCE_CATEGORIES.OPERATIONAL}>{t('finance.category.operationalOption')}</Option>
                  <Option value={FINANCE_CATEGORIES.PAYROLL}>{t('finance.category.GAJI')}</Option>
                  <Option value="PERLENGKAPAN">{t('finance.category.PERLENGKAPAN')}</Option>
                  <Option value="MAKAN">{t('finance.category.MAKAN')}</Option>
                  <Option value="TRANSPORT">{t('finance.category.TRANSPORT')}</Option>
                </>
              )}
            </Select>
          )}
        </Form.Item>

        <Form.Item
          name="payment_method"
          label={t('checkout.method')}
          rules={[{ required: true, message: t('salesDocuments.validation.required', { field: t('checkout.method') }) }]}
        >
          <Select
            onChange={handlePaymentMethodChange}
            options={[
              { value: 'TUNAI', label: t('payment.cash') },
              { value: 'NON_TUNAI', label: t('payment.nonCash') },
            ]}
          />
        </Form.Item>

        <Form.Item
          name="cash_account_id"
          label={t('finance.cashAccount')}
          rules={[{ required: true, message: t('finance.cashAccountRequired') }]}
        >
          <Select
            showSearch
            optionFilterProp="label"
            placeholder={t('finance.cashAccountPlaceholder')}
            options={cashBankAccountOptions}
          />
        </Form.Item>

        <Form.Item name="payment_channel" label={t('finance.paymentChannel')}>
          <Input placeholder={t('finance.paymentChannelPlaceholder')} />
        </Form.Item>

        <Form.Item
          name="description"
          label={t('finance.description')}
          rules={[{ required: true, message: t('finance.descriptionRequired') }]}
        >
          <Input.TextArea
            placeholder={
              type === 'OPENING_BALANCE' ? t('finance.descriptionOpeningPlaceholder') :
                type === 'INCOME' ? t('finance.descriptionIncomePlaceholder') :
                  t('finance.descriptionExpensePlaceholder')
            }
            rows={3}
          />
        </Form.Item>

        <div className="mt-6 flex justify-end gap-2">
          <Button onClick={onCancel}>
            {t('stock.form.cancel')}
          </Button>
          <Button
            type="primary"
            htmlType="submit"
            loading={submitting}
            danger={type === 'EXPENSE'}
            className={type === 'INCOME' ? 'bg-green-600 hover:bg-green-700 border-none' : ''}
          >
            {t('finance.saveTransaction')}
          </Button>
        </div>
      </Form>
    </Modal>
  );
}
