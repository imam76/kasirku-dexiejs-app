import { App, DatePicker, Form, InputNumber, Modal, Segmented } from 'antd';
import type { Dayjs } from 'dayjs';
import dayjs from '@/lib/dayjs';
import { BASE_CURRENCY_CODE } from '@/constants/currencies';
import { useI18n } from '@/hooks/useI18n';
import type { Currency, CurrencyRate } from '@/types';

export interface CurrencyRateFormValues {
  rate_date?: Dayjs;
  unit_amount?: number;
  bi_buy_rate?: number;
  bi_sell_rate?: number;
  middle_rate?: number;
  mode?: 'BI' | 'MANUAL';
}

interface CurrencyRateModalProps {
  open: boolean;
  currency?: Currency | null;
  latestRate?: CurrencyRate;
  baseCurrencyCode: string;
  baseCurrencySymbol: string;
  isSavingRate: boolean;
  isFetchingBiRate: boolean;
  onCancel: () => void;
  onManualSubmit: (values: Required<Pick<CurrencyRateFormValues, 'rate_date' | 'unit_amount' | 'middle_rate'>> & CurrencyRateFormValues) => Promise<void>;
  onFetchBiRate: (currencyCode: string, targetDate: string) => Promise<void>;
}

export default function CurrencyRateModal({
  open,
  currency,
  latestRate,
  baseCurrencyCode,
  baseCurrencySymbol,
  isSavingRate,
  isFetchingBiRate,
  onCancel,
  onManualSubmit,
  onFetchBiRate,
}: CurrencyRateModalProps) {
  const { message } = App.useApp();
  const { t } = useI18n();
  const [form] = Form.useForm<CurrencyRateFormValues>();
  const canFetchBiRate = Boolean(currency) && currency?.code !== baseCurrencyCode && baseCurrencyCode === BASE_CURRENCY_CODE;
  const defaultMode = canFetchBiRate ? 'BI' : 'MANUAL';
  const mode = Form.useWatch('mode', form) ?? defaultMode;

  const closeModal = () => {
    form.resetFields();
    onCancel();
  };

  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      const rateDate = values.rate_date?.format('YYYY-MM-DD') ?? dayjs().format('YYYY-MM-DD');
      if (!currency) return;

      if ((values.mode ?? defaultMode) === 'MANUAL') {
        if (!values.middle_rate || values.middle_rate <= 0) {
          message.error(t('currencies.validation.rateRequired'));
          return;
        }

        await onManualSubmit({
          ...values,
          rate_date: values.rate_date ?? dayjs(),
          unit_amount: values.unit_amount ?? 1,
          middle_rate: values.middle_rate,
        });
        closeModal();
        return;
      }

      await onFetchBiRate(currency.code, rateDate);
      closeModal();
    } catch (error) {
      if (error && typeof error === 'object' && 'errorFields' in error) return;
      message.error(error instanceof Error ? error.message : t('currencies.saveFailed'));
    }
  };

  return (
    <Modal
      title={currency ? t('currencies.rateTitle', { code: currency.code }) : t('currencies.rate')}
      open={open}
      onCancel={closeModal}
      onOk={handleOk}
      confirmLoading={isSavingRate || isFetchingBiRate}
      destroyOnHidden
      forceRender
      width={620}
    >
      <Form<CurrencyRateFormValues>
        form={form}
        layout="vertical"
        requiredMark={false}
        className="mt-4"
        initialValues={{
          mode: defaultMode,
          rate_date: latestRate?.rate_date ? dayjs(latestRate.rate_date) : dayjs(),
          unit_amount: latestRate?.unit_amount ?? 1,
          bi_buy_rate: latestRate?.bi_buy_rate,
          bi_sell_rate: latestRate?.bi_sell_rate,
          middle_rate: latestRate?.middle_rate,
        }}
      >
        <Form.Item name="mode" label={t('currencies.rateMode')}>
          <Segmented
            block
            options={[
              { value: 'BI', label: t('currencies.rateModeBi'), disabled: !canFetchBiRate },
              { value: 'MANUAL', label: t('currencies.rateModeManual') },
            ]}
          />
        </Form.Item>
        <Form.Item name="rate_date" label={t('currencies.rateDate')} rules={[{ required: true, message: t('currencies.validation.rateDateRequired') }]}>
          <DatePicker className="w-full" />
        </Form.Item>
        <Form.Item name="unit_amount" label={t('currencies.unitAmount')} rules={[{ required: true, message: t('currencies.validation.unitAmountRequired') }]}>
          <InputNumber min={0.000001} className="w-full" />
        </Form.Item>
        {mode === 'MANUAL' && (
          <Form.Item
            name="middle_rate"
            label={`${t('currencies.middleRate')} (${currency?.code ?? '-'}/${baseCurrencyCode}, ${baseCurrencySymbol})`}
            rules={[{ required: true, message: t('currencies.validation.rateRequired') }]}
          >
            <InputNumber min={0.000001} className="w-full" />
          </Form.Item>
        )}
        {mode === 'BI' && (
          <div className="rounded border border-gray-100 bg-gray-50 px-3 py-2 text-xs leading-5 text-gray-500">
            {t('currencies.biFetchHelper')}
          </div>
        )}
      </Form>
    </Modal>
  );
}
