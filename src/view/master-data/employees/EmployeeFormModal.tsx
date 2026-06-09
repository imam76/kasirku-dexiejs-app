import { Form, Input, Modal, Select, Switch } from 'antd';
import type { FormInstance } from 'antd';
import { useI18n } from '@/hooks/useI18n';
import type { AuthUser, CooperativeArea } from '@/types';

const { TextArea } = Input;

export interface EmployeeFormValues {
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  position?: string;
  user_id?: string;
  area_ids?: string[];
  notes?: string;
  is_active?: boolean;
}

interface EmployeeFormModalProps {
  form: FormInstance<EmployeeFormValues>;
  areas: CooperativeArea[];
  authUsers: AuthUser[];
  open: boolean;
  isEditing: boolean;
  isSubmitting: boolean;
  onCancel: () => void;
  onSubmit: (values: EmployeeFormValues) => void;
}

export default function EmployeeFormModal({
  form,
  areas,
  authUsers,
  open,
  isEditing,
  isSubmitting,
  onCancel,
  onSubmit,
}: EmployeeFormModalProps) {
  const { t } = useI18n();

  return (
    <Modal
      title={isEditing ? t('employees.editTitle') : t('employees.addTitle')}
      open={open}
      onCancel={onCancel}
      onOk={() => form.submit()}
      confirmLoading={isSubmitting}
      destroyOnHidden
      forceRender
      width={780}
    >
      <Form<EmployeeFormValues>
        form={form}
        layout="vertical"
        onFinish={onSubmit}
        requiredMark={false}
        className="mt-4"
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Form.Item
            name="name"
            label={t('employees.form.name')}
            rules={[{ required: true, whitespace: true, message: t('employees.validation.nameRequired') }]}
          >
            <Input placeholder={t('employees.form.namePlaceholder')} />
          </Form.Item>
          <Form.Item name="position" label={t('employees.form.position')}>
            <Input placeholder={t('employees.form.positionPlaceholder')} />
          </Form.Item>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Form.Item name="phone" label={t('employees.form.phone')}>
            <Input placeholder={t('employees.form.phonePlaceholder')} />
          </Form.Item>
          <Form.Item name="email" label={t('employees.form.email')} rules={[{ type: 'email', message: t('employees.validation.emailInvalid') }]}>
            <Input placeholder={t('employees.form.emailPlaceholder')} />
          </Form.Item>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Form.Item name="user_id" label={t('employees.form.user')}>
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder={t('employees.form.userPlaceholder')}
              options={authUsers.map((user) => ({
                value: user.id,
                label: `${user.name} (${user.role})`,
                disabled: !user.is_active,
              }))}
            />
          </Form.Item>
          <Form.Item name="area_ids" label={t('employees.form.areas')}>
            <Select
              mode="multiple"
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder={t('employees.form.areasPlaceholder')}
              options={areas.map((area) => ({
                value: area.id,
                label: area.code ? `${area.code} - ${area.name}` : area.name,
                disabled: !area.is_active,
              }))}
            />
          </Form.Item>
        </div>

        <Form.Item name="address" label={t('employees.form.address')}>
          <TextArea rows={2} placeholder={t('employees.form.addressPlaceholder')} />
        </Form.Item>
        <Form.Item name="notes" label={t('employees.form.notes')}>
          <TextArea rows={2} placeholder={t('employees.form.notesPlaceholder')} />
        </Form.Item>
        <Form.Item name="is_active" label={t('employees.form.status')} valuePropName="checked">
          <Switch checkedChildren={t('employees.status.active')} unCheckedChildren={t('employees.status.inactive')} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
