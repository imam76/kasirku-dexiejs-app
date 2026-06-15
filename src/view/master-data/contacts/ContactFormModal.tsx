import { Form, Input, Modal, Select, Switch } from 'antd';
import type { FormInstance } from 'antd';
import { useI18n } from '@/hooks/useI18n';
import type { ContactType, RetailMembershipStatus } from '@/types';
import { contactTypeOptions } from './contactOptions';

const { TextArea } = Input;

export interface ContactFormValues {
  name: string;
  contact_type: ContactType;
  phone?: string;
  email?: string;
  address?: string;
  company_name?: string;
  tax_number?: string;
  notes?: string;
  is_active?: boolean;
  is_member?: boolean;
  membership_number?: string;
  membership_status?: RetailMembershipStatus;
  membership_joined_at?: string;
}

interface ContactFormModalProps {
  form: FormInstance<ContactFormValues>;
  open: boolean;
  isEditing: boolean;
  isSubmitting: boolean;
  onCancel: () => void;
  onSubmit: (values: ContactFormValues) => void;
}

export default function ContactFormModal({
  form,
  open,
  isEditing,
  isSubmitting,
  onCancel,
  onSubmit,
}: ContactFormModalProps) {
  const { t } = useI18n();
  const isMember = Form.useWatch('is_member', form);

  return (
    <Modal
      title={isEditing ? t('contacts.editTitle') : t('contacts.addTitle')}
      open={open}
      onCancel={onCancel}
      onOk={() => form.submit()}
      confirmLoading={isSubmitting}
      destroyOnHidden
      forceRender
      width={760}
    >
      <Form<ContactFormValues>
        form={form}
        layout="vertical"
        onFinish={onSubmit}
        requiredMark={false}
        className="mt-4"
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Form.Item name="name" label={t('contacts.form.name')} rules={[{ required: true, whitespace: true, message: t('contacts.validation.nameRequired') }]}>
            <Input placeholder={t('contacts.form.namePlaceholder')} />
          </Form.Item>
          <Form.Item name="contact_type" label={t('contacts.form.type')} rules={[{ required: true, message: t('contacts.validation.typeRequired') }]}>
            <Select options={contactTypeOptions.map((option) => ({ value: option.value, label: t(option.labelKey) }))} />
          </Form.Item>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Form.Item name="phone" label={t('contacts.form.phone')}>
            <Input placeholder={t('contacts.form.phonePlaceholder')} />
          </Form.Item>
          <Form.Item name="email" label={t('contacts.form.email')} rules={[{ type: 'email', message: t('contacts.validation.emailInvalid') }]}>
            <Input placeholder={t('contacts.form.emailPlaceholder')} />
          </Form.Item>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Form.Item name="company_name" label={t('contacts.form.company')}>
            <Input placeholder={t('contacts.form.companyPlaceholder')} />
          </Form.Item>
          <Form.Item name="tax_number" label={t('contacts.form.taxNumber')}>
            <Input placeholder={t('contacts.form.taxNumberPlaceholder')} />
          </Form.Item>
        </div>

        <Form.Item name="address" label={t('contacts.form.address')}>
          <TextArea rows={3} placeholder={t('contacts.form.addressPlaceholder')} />
        </Form.Item>
        <Form.Item name="notes" label={t('contacts.form.notes')}>
          <TextArea rows={3} placeholder={t('contacts.form.notesPlaceholder')} />
        </Form.Item>
        <div className="mb-4 rounded-lg border border-blue-100 bg-blue-50/60 p-4">
          <Form.Item name="is_member" label="Membership Retail" valuePropName="checked" className="mb-0">
            <Switch checkedChildren="Member" unCheckedChildren="Non-member" />
          </Form.Item>
          {isMember && (
            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
              <Form.Item name="membership_number" label="Nomor Member">
                <Input placeholder="Otomatis jika kosong" />
              </Form.Item>
              <Form.Item name="membership_status" label="Status Member" initialValue="ACTIVE">
                <Select
                  options={[
                    { value: 'ACTIVE', label: 'Aktif' },
                    { value: 'INACTIVE', label: 'Nonaktif' },
                  ]}
                />
              </Form.Item>
            </div>
          )}
        </div>
        <Form.Item name="is_active" label={t('contacts.form.status')} valuePropName="checked">
          <Switch checkedChildren={t('contacts.status.active')} unCheckedChildren={t('contacts.status.inactive')} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
