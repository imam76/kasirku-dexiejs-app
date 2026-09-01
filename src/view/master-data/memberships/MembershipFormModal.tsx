import { Form, Input, Modal, Select, Switch } from 'antd';
import type { FormInstance } from 'antd';
import { useI18n } from '@/hooks/useI18n';
import type { Contact, RetailMembershipStatus } from '@/types';

export interface MembershipFormValues {
  phone: string;
  name?: string;
  email?: string;
  contact_id?: string;
  status?: RetailMembershipStatus;
  is_active?: boolean;
}

interface MembershipFormModalProps {
  form: FormInstance<MembershipFormValues>;
  open: boolean;
  isEditing: boolean;
  isSubmitting: boolean;
  contacts: Contact[];
  onCancel: () => void;
  onSubmit: (values: MembershipFormValues) => void;
}

export default function MembershipFormModal({
  form,
  open,
  isEditing,
  isSubmitting,
  contacts,
  onCancel,
  onSubmit,
}: MembershipFormModalProps) {
  const { t } = useI18n();

  return (
    <Modal
      title={isEditing ? t('members.editTitle') : t('members.addTitle')}
      open={open}
      onCancel={onCancel}
      onOk={() => form.submit()}
      confirmLoading={isSubmitting}
      destroyOnHidden
      forceRender
      width={640}
    >
      <Form<MembershipFormValues>
        form={form}
        layout="vertical"
        onFinish={onSubmit}
        requiredMark={false}
        className="mt-4"
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Form.Item
            name="phone"
            label={t('members.form.phone')}
            rules={[{ required: true, whitespace: true, message: t('members.validation.phoneRequired') }]}
          >
            <Input placeholder={t('members.form.phonePlaceholder')} />
          </Form.Item>
          <Form.Item name="name" label={t('members.form.name')}>
            <Input placeholder={t('members.form.namePlaceholder')} />
          </Form.Item>
        </div>

        <Form.Item name="email" label={t('members.form.email')} rules={[{ type: 'email', message: t('members.validation.emailInvalid') }]}>
          <Input placeholder={t('members.form.emailPlaceholder')} />
        </Form.Item>

        <Form.Item name="contact_id" label={t('members.form.linkedContact')}>
          <Select
            allowClear
            showSearch
            placeholder={t('members.form.linkedContactPlaceholder')}
            optionFilterProp="label"
            options={contacts.map((contact) => ({
              value: contact.id,
              label: contact.company_name ? `${contact.name} - ${contact.company_name}` : contact.name,
            }))}
          />
        </Form.Item>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Form.Item name="status" label={t('members.form.status')} initialValue="ACTIVE">
            <Select
              options={[
                { value: 'ACTIVE', label: t('members.status.active') },
                { value: 'INACTIVE', label: t('members.status.inactive') },
              ]}
            />
          </Form.Item>
          <Form.Item name="is_active" label={t('members.table.status')} valuePropName="checked">
            <Switch checkedChildren={t('members.status.active')} unCheckedChildren={t('members.status.inactive')} />
          </Form.Item>
        </div>
      </Form>
    </Modal>
  );
}
