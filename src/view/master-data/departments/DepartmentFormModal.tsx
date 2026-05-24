import { Form, Input, Modal, Switch } from 'antd';
import type { FormInstance } from 'antd';
import { useI18n } from '@/hooks/useI18n';

const { TextArea } = Input;

export interface DepartmentFormValues {
  name: string;
  code?: string;
  description?: string;
  is_active?: boolean;
}

interface DepartmentFormModalProps {
  form: FormInstance<DepartmentFormValues>;
  open: boolean;
  isEditing: boolean;
  isSubmitting: boolean;
  onCancel: () => void;
  onSubmit: (values: DepartmentFormValues) => void;
}

export default function DepartmentFormModal({
  form,
  open,
  isEditing,
  isSubmitting,
  onCancel,
  onSubmit,
}: DepartmentFormModalProps) {
  const { t } = useI18n();

  return (
    <Modal
      title={isEditing ? t('departments.editTitle') : t('departments.addTitle')}
      open={open}
      onCancel={onCancel}
      onOk={() => form.submit()}
      confirmLoading={isSubmitting}
      destroyOnHidden
      forceRender
      width={680}
    >
      <Form<DepartmentFormValues>
        form={form}
        layout="vertical"
        onFinish={onSubmit}
        requiredMark={false}
        className="mt-4"
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Form.Item name="name" label={t('departments.form.name')} rules={[{ required: true, whitespace: true, message: t('departments.validation.nameRequired') }]}>
            <Input placeholder={t('departments.form.namePlaceholder')} />
          </Form.Item>
          <Form.Item name="code" label={t('departments.form.code')} rules={[{ max: 20, message: t('departments.validation.codeMax') }]}>
            <Input placeholder={t('departments.form.codePlaceholder')} />
          </Form.Item>
        </div>

        <Form.Item name="description" label={t('departments.form.description')}>
          <TextArea rows={3} placeholder={t('departments.form.descriptionPlaceholder')} />
        </Form.Item>
        <Form.Item name="is_active" label={t('departments.form.status')} valuePropName="checked">
          <Switch checkedChildren={t('departments.status.active')} unCheckedChildren={t('departments.status.inactive')} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
