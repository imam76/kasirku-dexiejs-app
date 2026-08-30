import { useEffect, useMemo } from 'react';
import { Button, DatePicker, Form, Input, InputNumber, Segmented } from 'antd';
import type { FormInstance } from 'antd';
import type { Dayjs } from 'dayjs';
import { ResponsiveCrudEditor } from '@/components/mobile-crud';
import { getFinanceCategoryLabel } from '@/i18n/finance';
import { useI18n } from '@/hooks/useI18n';
import type { BudgetPeriodType, BudgetTransactionType } from '@/types';
import type { BudgetUpsertInput } from '@/services/budgetService';
import { getBudgetCategoryChoices } from './budgetCategoryOptions';

const { TextArea } = Input;

export interface BudgetFormValues {
  name: string;
  budget_type: BudgetTransactionType;
  category: string;
  period_type: BudgetPeriodType;
  period: Dayjs | null;
  planned_amount: number;
  warning_threshold_percent: number;
  notes?: string;
}

interface BudgetFormModalProps {
  form: FormInstance<BudgetFormValues>;
  open: boolean;
  isEditing: boolean;
  isSubmitting: boolean;
  onCancel: () => void;
  onSubmit: (values: BudgetUpsertInput) => void;
}

export default function BudgetFormModal({
  form,
  open,
  isEditing,
  isSubmitting,
  onCancel,
  onSubmit,
}: BudgetFormModalProps) {
  const { t } = useI18n();
  const budgetType = Form.useWatch('budget_type', form) ?? 'EXPENSE';
  const periodType = Form.useWatch('period_type', form) ?? 'MONTHLY';

  const categoryOptions = useMemo(() => (
    getBudgetCategoryChoices(budgetType).map((category) => ({
      value: category,
      label: getFinanceCategoryLabel(category, t),
    }))
  ), [budgetType, t]);

  useEffect(() => {
    if (!open) return;
    const currentCategory = form.getFieldValue('category') as string | undefined;
    const isCurrentCategoryValid = categoryOptions.some((option) => option.value === currentCategory);
    if (!isCurrentCategoryValid) {
      form.setFieldsValue({ category: categoryOptions[0]?.value });
    }
  }, [categoryOptions, form, open]);

  const handleFinish = (values: BudgetFormValues) => {
    const periodKey = values.period
      ? values.period.format(values.period_type === 'MONTHLY' ? 'YYYY-MM' : 'YYYY')
      : '';

    onSubmit({
      name: values.name,
      budget_type: values.budget_type,
      category: values.category,
      period_type: values.period_type,
      period_key: periodKey,
      planned_amount: values.planned_amount,
      warning_threshold_percent: values.warning_threshold_percent,
      notes: values.notes,
    });
  };

  return (
    <ResponsiveCrudEditor
      title={isEditing ? t('budget.editTitle') : t('budget.addTitle')}
      open={open}
      onClose={onCancel}
      desktopWidth={640}
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
      <Form<BudgetFormValues>
        form={form}
        layout="vertical"
        onFinish={handleFinish}
        requiredMark={false}
        className="mt-4"
      >
        <Form.Item name="name" label={t('budget.form.name')} rules={[{ required: true, whitespace: true, message: t('budget.validation.nameRequired') }]}>
          <Input placeholder={t('budget.form.namePlaceholder')} />
        </Form.Item>

        <Form.Item name="budget_type" label={t('budget.form.type')} rules={[{ required: true }]}>
          <Segmented
            block
            options={[
              { value: 'EXPENSE', label: t('budget.type.expense') },
              { value: 'INCOME', label: t('budget.type.income') },
            ]}
          />
        </Form.Item>

        <Form.Item name="category" label={t('budget.form.category')} rules={[{ required: true, message: t('budget.validation.categoryRequired') }]}>
          <Segmented
            options={categoryOptions.map((option) => ({ value: option.value, label: option.label }))}
            className="w-full flex-wrap [&_.ant-segmented-group]:flex-wrap"
          />
        </Form.Item>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Form.Item name="period_type" label={t('budget.form.periodType')} rules={[{ required: true }]}>
            <Segmented
              block
              options={[
                { value: 'MONTHLY', label: t('budget.periodType.monthly') },
                { value: 'YEARLY', label: t('budget.periodType.yearly') },
              ]}
            />
          </Form.Item>
          <Form.Item name="period" label={t('budget.form.period')} rules={[{ required: true, message: t('budget.validation.periodRequired') }]}>
            <DatePicker
              className="w-full"
              picker={periodType === 'MONTHLY' ? 'month' : 'year'}
              allowClear={false}
            />
          </Form.Item>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Form.Item
            name="planned_amount"
            label={t('budget.form.plannedAmount')}
            rules={[
              { required: true, message: t('budget.validation.plannedAmountRequired') },
              { type: 'number', min: 0, message: t('budget.validation.plannedAmountMin') },
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
          <Form.Item
            name="warning_threshold_percent"
            label={t('budget.form.warningThreshold')}
            rules={[{ type: 'number', min: 0, max: 1000, message: t('budget.validation.warningThresholdInvalid') }]}
          >
            <InputNumber min={0} max={1000} className="w-full" suffix="%" />
          </Form.Item>
        </div>

        <Form.Item name="notes" label={t('budget.form.notes')}>
          <TextArea rows={3} placeholder={t('budget.form.notesPlaceholder')} />
        </Form.Item>
      </Form>
    </ResponsiveCrudEditor>
  );
}
