import { Form, Input, InputNumber, Modal, Switch } from 'antd';
import type { FormInstance } from 'antd';
import { useI18n } from '@/hooks/useI18n';

export interface CurrencyFormValues {
  code: string;
  name: string;
  symbol?: string;
  decimal_places?: number;
  is_active?: boolean;
}

interface CurrencyFormModalProps {
  form: FormInstance<CurrencyFormValues>;
  open: boolean;
  isEditing: boolean;
  isBaseCurrency: boolean;
  isSubmitting: boolean;
  onCancel: () => void;
  onSubmit: (values: CurrencyFormValues) => void;
}

export default function CurrencyFormModal({
  form,
  open,
  isEditing,
  isBaseCurrency,
  isSubmitting,
  onCancel,
  onSubmit,
}: CurrencyFormModalProps) {
  const { t } = useI18n();

  return (
    <Modal
      title={isEditing ? t('currencies.editTitle') : t('currencies.addTitle')}
      open={open}
      onCancel={onCancel}
      onOk={() => form.submit()}
      confirmLoading={isSubmitting}
      destroyOnHidden
      forceRender
      width={680}
    >
      <Form<CurrencyFormValues>
        form={form}
        layout="vertical"
        onFinish={onSubmit}
        requiredMark={false}
        className="mt-4"
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Form.Item
            name="code"
            label={t('currencies.form.code')}
            normalize={(value: string) => value?.toUpperCase()}
            rules={[
              { required: true, whitespace: true, message: t('currencies.validation.codeRequired') },
              { pattern: /^[A-Z]{3}$/, message: t('currencies.validation.codeFormat') },
            ]}
          >
            <Input disabled={isEditing} maxLength={3} placeholder={t('currencies.form.codePlaceholder')} />
          </Form.Item>
          <Form.Item
            name="name"
            label={t('currencies.form.name')}
            rules={[{ required: true, whitespace: true, message: t('currencies.validation.nameRequired') }]}
          >
            <Input placeholder={t('currencies.form.namePlaceholder')} />
          </Form.Item>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Form.Item name="symbol" label={t('currencies.form.symbol')}>
            <Input placeholder={t('currencies.form.symbolPlaceholder')} />
          </Form.Item>
          <Form.Item name="decimal_places" label={t('currencies.form.decimalPlaces')}>
            <InputNumber min={0} max={8} className="w-full" />
          </Form.Item>
        </div>

        <Form.Item name="is_active" label={t('currencies.form.status')} valuePropName="checked">
          <Switch
            disabled={isBaseCurrency}
            checkedChildren={t('currencies.status.active')}
            unCheckedChildren={t('currencies.status.inactive')}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}
