import { Button, Form, Input, InputNumber } from 'antd';
import type { FormInstance } from 'antd';
import { ResponsiveCrudEditor } from '@/components/mobile-crud';
import { useI18n } from '@/hooks/useI18n';

const { TextArea } = Input;

export interface BudgetCommitmentFormValues {
  description: string;
  amount: number;
  notes?: string;
}

interface BudgetCommitmentFormModalProps {
  form: FormInstance<BudgetCommitmentFormValues>;
  open: boolean;
  isEditing: boolean;
  isSubmitting: boolean;
  onCancel: () => void;
  onSubmit: (values: BudgetCommitmentFormValues) => void;
}

export default function BudgetCommitmentFormModal({
  form,
  open,
  isEditing,
  isSubmitting,
  onCancel,
  onSubmit,
}: BudgetCommitmentFormModalProps) {
  const { t } = useI18n();

  return (
    <ResponsiveCrudEditor
      title={isEditing ? t('budget.commitment.editTitle') : t('budget.commitment.addTitle')}
      open={open}
      onClose={onCancel}
      desktopWidth={520}
      footer={(
        <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
          <Button size="large" onClick={onCancel} disabled={isSubmitting}>
            {t('common.cancel')}
          </Button>
          <Button
            size="large"
            type="primary"
            loading={isSubmitting}
            disabled={isSubmitting}
            onClick={() => form.submit()}
          >
            {t('budget.form.save')}
          </Button>
        </div>
      )}
    >
      <Form<BudgetCommitmentFormValues>
        form={form}
        layout="vertical"
        onFinish={onSubmit}
        requiredMark={false}
        className="mt-4"
      >
        <Form.Item
          name="description"
          label={t('budget.commitment.description')}
          rules={[{ required: true, whitespace: true, message: t('budget.commitment.description') }]}
        >
          <Input placeholder={t('budget.commitment.descriptionPlaceholder')} />
        </Form.Item>

        <Form.Item
          name="amount"
          label={t('budget.commitment.amount')}
          rules={[
            { required: true, message: t('budget.commitment.amount') },
            { type: 'number', min: 0 },
          ]}
        >
          <InputNumber<number>
            min={0}
            className="w-full"
            prefix="Rp"
            formatter={(value) => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}
            parser={(value) => value?.replace(/\./g, '') as unknown as number}
          />
        </Form.Item>

        <Form.Item name="notes" label={t('budget.commitment.notes')}>
          <TextArea rows={3} placeholder={t('budget.commitment.notesPlaceholder')} />
        </Form.Item>
      </Form>
    </ResponsiveCrudEditor>
  );
}
