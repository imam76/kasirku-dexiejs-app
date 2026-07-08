import { DatePicker, Form, Input, InputNumber, Modal, Select, Switch } from 'antd';
import type { FormInstance } from 'antd';
import type { Dayjs } from 'dayjs';
import { useI18n } from '@/hooks/useI18n';
import type { ChartOfAccount, TaxCalculationMode, TaxFlow } from '@/types';
import { taxCalculationModeOptions, taxFlowOptions } from './taxOptions';

const { TextArea } = Input;

export interface TaxFormValues {
  name: string;
  code?: string;
  rate: number;
  rate_type?: 'PERCENTAGE';
  calculation_mode: TaxCalculationMode;
  tax_flow?: TaxFlow;
  sales_tax_account_id?: string;
  purchase_tax_account_id?: string;
  effective_from?: Dayjs | null;
  effective_to?: Dayjs | null;
  description?: string;
  is_default?: boolean;
  is_active?: boolean;
}

interface TaxFormModalProps {
  form: FormInstance<TaxFormValues>;
  open: boolean;
  isEditing: boolean;
  isSubmitting: boolean;
  accounts: ChartOfAccount[];
  onCancel: () => void;
  onSubmit: (values: TaxFormValues) => void;
}

export default function TaxFormModal({
  form,
  open,
  isEditing,
  isSubmitting,
  accounts,
  onCancel,
  onSubmit,
}: TaxFormModalProps) {
  const { t } = useI18n();
  const taxFlow = Form.useWatch('tax_flow', form) ?? 'ADDITIVE';
  const accountOptions = accounts
    .filter((account) => account.is_active && account.is_postable)
    .map((account) => ({
      value: account.id,
      label: `${account.code} - ${account.name}`,
    }));

  return (
    <Modal
      title={isEditing ? t('taxes.editTitle') : t('taxes.addTitle')}
      open={open}
      onCancel={onCancel}
      onOk={() => form.submit()}
      confirmLoading={isSubmitting}
      destroyOnHidden
      forceRender
      width={760}
    >
      <Form<TaxFormValues>
        form={form}
        layout="vertical"
        onFinish={onSubmit}
        requiredMark={false}
        className="mt-4"
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Form.Item name="name" label={t('taxes.form.name')} rules={[{ required: true, whitespace: true, message: t('taxes.validation.nameRequired') }]}>
            <Input placeholder={t('taxes.form.namePlaceholder')} />
          </Form.Item>
          <Form.Item name="code" label={t('taxes.form.code')} rules={[{ max: 30, message: t('taxes.validation.codeMax') }]}>
            <Input placeholder={t('taxes.form.codePlaceholder')} />
          </Form.Item>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Form.Item name="rate" label={t('taxes.form.rate')} rules={[{ required: true, message: t('taxes.validation.rateRequired') }, { type: 'number', min: 0, max: 100, message: t('taxes.validation.rateRange') }]}>
            <InputNumber min={0} max={100} className="w-full" suffix="%" />
          </Form.Item>
          <Form.Item name="calculation_mode" label={t('taxes.form.mode')} rules={[{ required: true, message: t('taxes.validation.modeRequired') }]}>
            <Select options={taxCalculationModeOptions.map((option) => ({ value: option.value, label: t(option.labelKey) }))} />
          </Form.Item>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Form.Item name="tax_flow" label={t('taxes.form.flow')} rules={[{ required: true, message: t('taxes.validation.flowRequired') }]}>
            <Select options={taxFlowOptions.map((option) => ({ value: option.value, label: t(option.labelKey) }))} />
          </Form.Item>
          <Form.Item
            name="sales_tax_account_id"
            label={t('taxes.form.salesAccount')}
            rules={[
              {
                validator(_, value: string | undefined) {
                  if (taxFlow !== 'ADDITIVE' || value) return Promise.resolve();
                  return Promise.reject(new Error(t('taxes.validation.salesAccountRequired')));
                },
              },
            ]}
          >
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              disabled={taxFlow === 'WITHHOLDING'}
              placeholder={t('taxes.form.accountPlaceholder')}
              options={accountOptions}
            />
          </Form.Item>
        </div>

        <Form.Item
          name="purchase_tax_account_id"
          label={taxFlow === 'WITHHOLDING' ? t('taxes.form.withholdingAccount') : t('taxes.form.purchaseAccount')}
          rules={[
            {
              validator(_, value: string | undefined) {
                if (taxFlow !== 'WITHHOLDING' || value) return Promise.resolve();
                return Promise.reject(new Error(t('taxes.validation.purchaseAccountRequired')));
              },
            },
          ]}
        >
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder={t('taxes.form.accountPlaceholder')}
            options={accountOptions}
          />
        </Form.Item>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Form.Item name="effective_from" label={t('taxes.form.effectiveFrom')}>
            <DatePicker className="w-full" />
          </Form.Item>
          <Form.Item
            name="effective_to"
            label={t('taxes.form.effectiveTo')}
            dependencies={['effective_from']}
            rules={[
              ({ getFieldValue }) => ({
                validator(_, value: Dayjs | null) {
                  const effectiveFrom = getFieldValue('effective_from') as Dayjs | null;
                  if (!effectiveFrom || !value || !value.isBefore(effectiveFrom, 'day')) {
                    return Promise.resolve();
                  }
                  return Promise.reject(new Error(t('taxes.validation.effectiveToAfterFrom')));
                },
              }),
            ]}
          >
            <DatePicker className="w-full" />
          </Form.Item>
        </div>

        <Form.Item name="description" label={t('taxes.form.description')}>
          <TextArea rows={3} placeholder={t('taxes.form.descriptionPlaceholder')} />
        </Form.Item>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Form.Item name="is_default" label={t('taxes.form.default')} valuePropName="checked">
            <Switch checkedChildren={t('taxes.default.yes')} unCheckedChildren={t('taxes.default.no')} />
          </Form.Item>
          <Form.Item name="is_active" label={t('taxes.form.status')} valuePropName="checked">
            <Switch checkedChildren={t('taxes.status.active')} unCheckedChildren={t('taxes.status.inactive')} />
          </Form.Item>
        </div>
      </Form>
    </Modal>
  );
}
