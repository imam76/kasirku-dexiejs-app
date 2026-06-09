import { Form, Input, Modal, Switch } from 'antd';
import type { FormInstance } from 'antd';
import { useI18n } from '@/hooks/useI18n';

const { TextArea } = Input;

export interface AreaFormValues {
  name: string;
  code?: string;
  description?: string;
  is_active?: boolean;
}

interface AreaFormModalProps {
  form: FormInstance<AreaFormValues>;
  open: boolean;
  isEditing: boolean;
  isSubmitting: boolean;
  onCancel: () => void;
  onSubmit: (values: AreaFormValues) => void;
}

export default function AreaFormModal({
  form,
  open,
  isEditing,
  isSubmitting,
  onCancel,
  onSubmit,
}: AreaFormModalProps) {
  const { t } = useI18n();

  return (
    <Modal
      title={isEditing ? t('areas.editTitle') : t('areas.addTitle')}
      open={open}
      onCancel={onCancel}
      onOk={() => form.submit()}
      confirmLoading={isSubmitting}
      destroyOnHidden
      forceRender
      width={680}
    >
      <Form<AreaFormValues>
        form={form}
        layout="vertical"
        onFinish={onSubmit}
        requiredMark={false}
        className="mt-4"
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Form.Item
            name="name"
            label={t('areas.form.name')}
            rules={[{ required: true, whitespace: true, message: t('areas.validation.nameRequired') }]}
          >
            <Input placeholder={t('areas.form.namePlaceholder')} />
          </Form.Item>
          <Form.Item
            name="code"
            label={t('areas.form.code')}
            rules={[{ max: 20, message: t('areas.validation.codeMax') }]}
          >
            <Input placeholder={t('areas.form.codePlaceholder')} />
          </Form.Item>
        </div>

        <Form.Item name="description" label={t('areas.form.description')}>
          <TextArea rows={3} placeholder={t('areas.form.descriptionPlaceholder')} />
        </Form.Item>
        <Form.Item name="is_active" label={t('areas.form.status')} valuePropName="checked">
          <Switch checkedChildren={t('areas.status.active')} unCheckedChildren={t('areas.status.inactive')} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
