import { DatePicker, Form, Input, InputNumber, Modal, Select } from 'antd';
import type { FormInstance } from 'antd';
import type { Dayjs } from 'dayjs';
import { useMemo } from 'react';
import { useI18n } from '@/hooks/useI18n';
import type { CooperativeMember } from '@/types';

const { TextArea } = Input;

export interface CooperativeLoanFormValues {
  member_id: string;
  principal_amount: number;
  interest_rate_per_month: number;
  tenor_months: number;
  application_date: Dayjs;
  notes?: string;
}

interface CooperativeLoanFormModalProps {
  form: FormInstance<CooperativeLoanFormValues>;
  open: boolean;
  isSubmitting: boolean;
  activeMembers: CooperativeMember[];
  onCancel: () => void;
  onSubmit: (values: CooperativeLoanFormValues) => void;
}

export default function CooperativeLoanFormModal({
  form,
  open,
  isSubmitting,
  activeMembers,
  onCancel,
  onSubmit,
}: CooperativeLoanFormModalProps) {
  const { t } = useI18n();
  const memberOptions = useMemo(() => activeMembers.map((member) => ({
    value: member.id,
    label: `${member.member_number} - ${member.name}`,
  })), [activeMembers]);

  return (
    <Modal
      title={t('cooperative.loans.addTitle')}
      open={open}
      onCancel={onCancel}
      onOk={() => form.submit()}
      okText={t('cooperative.loans.submit')}
      okButtonProps={{ 'data-testid': 'koperasi-loan-submit-button' }}
      confirmLoading={isSubmitting}
      destroyOnHidden
      forceRender
      width={820}
    >
      <Form<CooperativeLoanFormValues>
        form={form}
        layout="vertical"
        onFinish={onSubmit}
        requiredMark={false}
        className="mt-4"
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Form.Item
            name="member_id"
            label={t('cooperative.loans.form.member')}
            rules={[{ required: true, message: t('cooperative.loans.validation.memberRequired') }]}
          >
            <Select
              showSearch
              optionFilterProp="label"
              placeholder={t('cooperative.loans.form.memberPlaceholder')}
              options={memberOptions}
              data-testid="koperasi-loan-member-select"
            />
          </Form.Item>
          <Form.Item
            name="application_date"
            label={t('cooperative.loans.form.applicationDate')}
            rules={[{ required: true, message: t('cooperative.loans.validation.applicationDateRequired') }]}
          >
            <DatePicker showTime className="w-full" data-testid="koperasi-loan-application-date-input" />
          </Form.Item>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Form.Item
            name="principal_amount"
            label={t('cooperative.loans.form.principalAmount')}
            rules={[
              { required: true, message: t('cooperative.loans.validation.principalRequired') },
              { type: 'number', min: 1, message: t('finance.amountMin') },
            ]}
          >
            <InputNumber<number>
              min={1}
              className="w-full"
              formatter={(value) => `Rp ${value ?? ''}`.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}
              parser={(value) => value?.replace(/Rp\s?|(\.*)/g, '') as unknown as number}
              placeholder="0"
              data-testid="koperasi-loan-principal-input"
            />
          </Form.Item>
          <Form.Item
            name="interest_rate_per_month"
            label={t('cooperative.loans.form.interestRate')}
            rules={[
              { required: true, message: t('cooperative.loans.validation.interestRequired') },
              { type: 'number', min: 0, message: t('cooperative.loans.validation.interestMin') },
            ]}
          >
            <InputNumber<number>
              min={0}
              step={0.1}
              className="w-full"
              formatter={(value) => `${value ?? ''}%`}
              parser={(value) => value?.replace('%', '') as unknown as number}
              placeholder="0"
              data-testid="koperasi-loan-interest-input"
            />
          </Form.Item>
          <Form.Item
            name="tenor_months"
            label={t('cooperative.loans.form.tenor')}
            rules={[
              { required: true, message: t('cooperative.loans.validation.tenorRequired') },
              { type: 'number', min: 1, message: t('cooperative.loans.validation.tenorMin') },
            ]}
          >
            <InputNumber<number>
              min={1}
              precision={0}
              className="w-full"
              placeholder="12"
              data-testid="koperasi-loan-tenor-input"
            />
          </Form.Item>
        </div>

        <Form.Item name="notes" label={t('cooperative.loans.form.notes')}>
          <TextArea rows={3} placeholder={t('cooperative.loans.form.notesPlaceholder')} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
