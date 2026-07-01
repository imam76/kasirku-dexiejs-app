import { Form, Input, Modal } from 'antd';
import { useI18n } from '@/hooks/useI18n';

const { TextArea } = Input;

export interface CooperativeAreaQuickCreateFormValues {
  name: string;
  description?: string;
}

interface CooperativeAreaQuickCreateModalProps {
  open: boolean;
  isSubmitting: boolean;
  onCancel: () => void;
  onSubmit: (values: CooperativeAreaQuickCreateFormValues) => void;
}

export default function CooperativeAreaQuickCreateModal({
  open,
  isSubmitting,
  onCancel,
  onSubmit,
}: CooperativeAreaQuickCreateModalProps) {
  const { t } = useI18n();
  const [form] = Form.useForm<CooperativeAreaQuickCreateFormValues>();

  return (
    <Modal
      title={t('areas.quickCreateTitle')}
      open={open}
      onCancel={onCancel}
      onOk={() => form.submit()}
      okText={t('areas.quickCreateOk')}
      confirmLoading={isSubmitting}
      destroyOnHidden
      forceRender
      afterOpenChange={(isOpen) => {
        if (!isOpen) form.resetFields();
      }}
      width={520}
    >
      <Form<CooperativeAreaQuickCreateFormValues>
        form={form}
        layout="vertical"
        onFinish={onSubmit}
        requiredMark={false}
        className="mt-4"
      >
        <Form.Item
          name="name"
          label={t('areas.form.name')}
          rules={[{ required: true, whitespace: true, message: t('areas.validation.nameRequired') }]}
        >
          <Input placeholder={t('areas.form.namePlaceholder')} autoFocus />
        </Form.Item>

        <Form.Item name="description" label={t('areas.form.description')}>
          <TextArea rows={3} placeholder={t('areas.form.descriptionPlaceholder')} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
