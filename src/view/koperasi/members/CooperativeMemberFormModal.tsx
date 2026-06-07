import { DatePicker, Form, Input, Modal, Select } from 'antd';
import type { FormInstance } from 'antd';
import type { Dayjs } from 'dayjs';
import { useI18n } from '@/hooks/useI18n';
import type { CooperativeMemberStatus } from '@/types';
import { cooperativeMemberStatusOptions } from './memberOptions';

const { TextArea } = Input;

export interface CooperativeMemberFormValues {
  member_number: string;
  name: string;
  identity_number?: string;
  phone?: string;
  address?: string;
  join_date: Dayjs | null;
  status: CooperativeMemberStatus;
  notes?: string;
}

interface CooperativeMemberFormModalProps {
  form: FormInstance<CooperativeMemberFormValues>;
  open: boolean;
  isEditing: boolean;
  isSubmitting: boolean;
  onCancel: () => void;
  onSubmit: (values: CooperativeMemberFormValues) => void;
}

export default function CooperativeMemberFormModal({
  form,
  open,
  isEditing,
  isSubmitting,
  onCancel,
  onSubmit,
}: CooperativeMemberFormModalProps) {
  const { t } = useI18n();

  return (
    <Modal
      title={isEditing ? t('cooperative.members.editTitle') : t('cooperative.members.addTitle')}
      open={open}
      onCancel={onCancel}
      onOk={() => form.submit()}
      okButtonProps={{ 'data-testid': 'koperasi-member-submit-button' }}
      confirmLoading={isSubmitting}
      destroyOnHidden
      forceRender
      width={780}
    >
      <Form<CooperativeMemberFormValues>
        form={form}
        layout="vertical"
        onFinish={onSubmit}
        requiredMark={false}
        className="mt-4"
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Form.Item
            name="member_number"
            label={t('cooperative.members.form.memberNumber')}
            rules={[
              { required: true, whitespace: true, message: t('cooperative.members.validation.memberNumberRequired') },
              { max: 40, message: t('cooperative.members.validation.memberNumberMax') },
            ]}
          >
            <Input
              placeholder={t('cooperative.members.form.memberNumberPlaceholder')}
              data-testid="koperasi-member-number-input"
            />
          </Form.Item>
          <Form.Item
            name="name"
            label={t('cooperative.members.form.name')}
            rules={[{ required: true, whitespace: true, message: t('cooperative.members.validation.nameRequired') }]}
          >
            <Input
              placeholder={t('cooperative.members.form.namePlaceholder')}
              data-testid="koperasi-member-name-input"
            />
          </Form.Item>
          <Form.Item
            name="status"
            label={t('cooperative.members.form.status')}
            rules={[{ required: true, message: t('cooperative.members.validation.statusRequired') }]}
          >
            <Select options={cooperativeMemberStatusOptions.map((option) => ({ value: option.value, label: t(option.labelKey) }))} />
          </Form.Item>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Form.Item
            name="join_date"
            label={t('cooperative.members.form.joinDate')}
            rules={[{ required: true, message: t('cooperative.members.validation.joinDateRequired') }]}
          >
            <DatePicker className="w-full" data-testid="koperasi-member-join-date-input" />
          </Form.Item>
          <Form.Item name="identity_number" label={t('cooperative.members.form.identityNumber')}>
            <Input
              placeholder={t('cooperative.members.form.identityNumberPlaceholder')}
              data-testid="koperasi-member-identity-input"
            />
          </Form.Item>
          <Form.Item name="phone" label={t('cooperative.members.form.phone')}>
            <Input
              placeholder={t('cooperative.members.form.phonePlaceholder')}
              data-testid="koperasi-member-phone-input"
            />
          </Form.Item>
        </div>

        <Form.Item name="address" label={t('cooperative.members.form.address')}>
          <TextArea
            rows={3}
            placeholder={t('cooperative.members.form.addressPlaceholder')}
            data-testid="koperasi-member-address-input"
          />
        </Form.Item>
        <Form.Item name="notes" label={t('cooperative.members.form.notes')}>
          <TextArea rows={3} placeholder={t('cooperative.members.form.notesPlaceholder')} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
