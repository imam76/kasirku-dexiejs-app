import { Form, Input, Modal, Switch } from 'antd';
import type { FormInstance } from 'antd';
import { useI18n } from '@/hooks/useI18n';

const { TextArea } = Input;

export interface WarehouseFormValues {
  name: string;
  code?: string;
  address?: string;
  phone?: string;
  notes?: string;
  is_active?: boolean;
}

interface WarehouseFormModalProps {
  form: FormInstance<WarehouseFormValues>;
  open: boolean;
  isEditing: boolean;
  isSubmitting: boolean;
  onCancel: () => void;
  onSubmit: (values: WarehouseFormValues) => void;
}

export default function WarehouseFormModal({
  form,
  open,
  isEditing,
  isSubmitting,
  onCancel,
  onSubmit,
}: WarehouseFormModalProps) {
  const { t } = useI18n();

  return (
    <Modal
      title={isEditing ? t('warehouses.editTitle') : t('warehouses.addTitle')}
      open={open}
      onCancel={onCancel}
      onOk={() => form.submit()}
      confirmLoading={isSubmitting}
      destroyOnHidden
      forceRender
      width={760}
    >
      <Form<WarehouseFormValues>
        form={form}
        layout="vertical"
        onFinish={onSubmit}
        requiredMark={false}
        className="mt-4"
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Form.Item name="name" label={t('warehouses.form.name')} rules={[{ required: true, whitespace: true, message: t('warehouses.validation.nameRequired') }]}>
            <Input placeholder={t('warehouses.form.namePlaceholder')} />
          </Form.Item>
          <Form.Item name="code" label={t('warehouses.form.code')}>
            <Input placeholder={t('warehouses.form.codePlaceholder')} />
          </Form.Item>
        </div>

        <Form.Item name="address" label={t('warehouses.form.address')}>
          <TextArea rows={3} placeholder={t('warehouses.form.addressPlaceholder')} />
        </Form.Item>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Form.Item name="phone" label={t('warehouses.form.phone')}>
            <Input placeholder={t('warehouses.form.phonePlaceholder')} />
          </Form.Item>
          <Form.Item name="is_active" label={t('warehouses.form.status')} valuePropName="checked">
            <Switch checkedChildren={t('warehouses.status.active')} unCheckedChildren={t('warehouses.status.inactive')} />
          </Form.Item>
        </div>

        <Form.Item name="notes" label={t('warehouses.form.notes')}>
          <TextArea rows={3} placeholder={t('warehouses.form.notesPlaceholder')} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
