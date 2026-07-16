import { Form, Input, InputNumber, Modal, Select, Switch } from 'antd';
import type { FormInstance } from 'antd';
import { useI18n } from '@/hooks/useI18n';
import { PAYMENT_METHOD_CATEGORIES } from '@/lib/validations/paymentMethod';
import type { ChartOfAccount, PaymentMethodCategory } from '@/types';

export interface PaymentMethodFormValues {
  code: string;
  name: string;
  category: PaymentMethodCategory;
  posting_account_id?: string;
  requires_reference?: boolean;
  is_active?: boolean;
  sort_order?: number;
}

interface Props {
  form: FormInstance<PaymentMethodFormValues>;
  open: boolean;
  isEditing: boolean;
  isSystem: boolean;
  isSubmitting: boolean;
  postingAccounts: ChartOfAccount[];
  onCancel: () => void;
  onSubmit: (values: PaymentMethodFormValues) => void;
}

export default function PaymentMethodFormModal({ form, open, isEditing, isSystem, isSubmitting, postingAccounts, onCancel, onSubmit }: Props) {
  const { t } = useI18n();
  const isActive = Form.useWatch('is_active', form) ?? true;

  return (
    <Modal title={isEditing ? t('paymentMethods.editTitle') : t('paymentMethods.addTitle')} open={open} onCancel={onCancel} onOk={() => form.submit()} confirmLoading={isSubmitting} destroyOnHidden forceRender width={760}>
      <Form<PaymentMethodFormValues> form={form} layout="vertical" onFinish={onSubmit} requiredMark={false} className="mt-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Form.Item name="code" label={t('paymentMethods.form.code')} rules={[{ required: true, message: t('paymentMethods.validation.codeRequired') }, { pattern: /^[A-Za-z0-9_-]{2,30}$/, message: t('paymentMethods.validation.codeFormat') }]}>
            <Input disabled={isSystem} maxLength={30} placeholder="QRIS" onChange={(event) => form.setFieldValue('code', event.target.value.toUpperCase())} />
          </Form.Item>
          <Form.Item name="name" label={t('paymentMethods.form.name')} rules={[{ required: true, whitespace: true, message: t('paymentMethods.validation.nameRequired') }]}>
            <Input maxLength={80} placeholder={t('paymentMethods.form.namePlaceholder')} />
          </Form.Item>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Form.Item name="category" label={t('paymentMethods.form.category')} rules={[{ required: true }]}>
            <Select options={PAYMENT_METHOD_CATEGORIES.map((category) => ({ value: category, label: t(`paymentMethods.category.${category}`) }))} />
          </Form.Item>
          <Form.Item name="posting_account_id" label={t('paymentMethods.form.account')} rules={[{ required: isActive, message: t('paymentMethods.validation.accountRequired') }]}>
            <Select allowClear showSearch optionFilterProp="label" placeholder={t('paymentMethods.form.accountPlaceholder')} options={postingAccounts.map((account) => ({ value: account.id, label: `${account.code} — ${account.name}` }))} />
          </Form.Item>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Form.Item name="sort_order" label={t('paymentMethods.form.sortOrder')}>
            <InputNumber min={0} max={999} className="w-full" />
          </Form.Item>
          <Form.Item name="requires_reference" label={t('paymentMethods.form.requiresReference')} valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="is_active" label={t('paymentMethods.form.status')} valuePropName="checked">
            <Switch checkedChildren={t('paymentMethods.status.active')} unCheckedChildren={t('paymentMethods.status.inactive')} />
          </Form.Item>
        </div>
      </Form>
    </Modal>
  );
}
