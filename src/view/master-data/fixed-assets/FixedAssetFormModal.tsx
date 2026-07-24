import { Alert, DatePicker, Divider, Form, Input, InputNumber, Modal, Select, Switch } from 'antd';
import type { FormInstance } from 'antd';
import type { Dayjs } from 'dayjs';
import { useMemo } from 'react';
import { useI18n } from '@/hooks/useI18n';
import { calculateFixedAssetPolicy } from '@/utils/fixedAssets/calculateDepreciation';
import type { ChartOfAccount, Department, FixedAssetCategory, FixedAssetRegistrationType, Project } from '@/types';

export interface FixedAssetFormValues {
  asset_code: string;
  name: string;
  category: FixedAssetCategory;
  location?: string;
  description?: string;
  registration_type: FixedAssetRegistrationType;
  acquisition_date: Dayjs;
  available_for_use_date: Dayjs;
  acquisition_cost: number;
  residual_value: number;
  useful_life_months: number;
  opening_balance_date?: Dayjs;
  opening_accumulated_depreciation?: number;
  opening_remaining_useful_life_months?: number;
  asset_account_id: string;
  accumulated_depreciation_account_id: string;
  depreciation_expense_account_id: string;
  department_id?: string;
  project_id?: string;
  is_active: boolean;
}

const accountOptions = (accounts: ChartOfAccount[]) => accounts.map((account) => ({
  value: account.id,
  label: `${account.code} - ${account.name}`,
}));

export default function FixedAssetFormModal({
  open, form, editing, hasPostedHistory, accounts, departments, projects, loading, currency,
  onCancel, onSubmit,
}: {
  open: boolean;
  form: FormInstance<FixedAssetFormValues>;
  editing: boolean;
  hasPostedHistory: boolean;
  accounts: ChartOfAccount[];
  departments: Department[];
  projects: Project[];
  loading: boolean;
  currency: (value: number) => string;
  onCancel: () => void;
  onSubmit: (values: FixedAssetFormValues) => void;
}) {
  const { t } = useI18n();
  const values = Form.useWatch([], form) as FixedAssetFormValues | undefined;
  const registrationType = Form.useWatch('registration_type', form) ?? 'NEW';
  const policy = useMemo(() => {
    if (
      !values?.available_for_use_date || !values.acquisition_cost || !values.useful_life_months ||
      values.acquisition_cost <= 0 || (values.residual_value ?? 0) < 0 ||
      (values.residual_value ?? 0) >= values.acquisition_cost
    ) return undefined;
    return calculateFixedAssetPolicy({
      registration_type: registrationType,
      available_for_use_date: values.available_for_use_date.format('YYYY-MM-DD'),
      acquisition_cost: values.acquisition_cost,
      residual_value: values.residual_value ?? 0,
      useful_life_months: values.useful_life_months,
      opening_balance_date: values.opening_balance_date?.format('YYYY-MM-DD'),
      opening_accumulated_depreciation: values.opening_accumulated_depreciation ?? 0,
      opening_remaining_useful_life_months: values.opening_remaining_useful_life_months,
    });
  }, [registrationType, values]);
  const locked = editing && hasPostedHistory;
  const required = [{ required: true, message: t('fixedAssets.validation.required') }];
  const categories: FixedAssetCategory[] = ['BUILDING', 'VEHICLE', 'MACHINERY_EQUIPMENT', 'OFFICE_EQUIPMENT', 'FURNITURE', 'OTHER'];
  const validAssetAccounts = accounts.filter((account) => account.is_active && account.is_postable && account.type === 'ASSET' && account.normal_balance === 'DEBIT');
  const validAccumulatedAccounts = accounts.filter((account) => account.is_active && account.is_postable && account.type === 'ASSET' && account.normal_balance === 'CREDIT');
  const validExpenseAccounts = accounts.filter((account) => account.is_active && account.is_postable && account.type === 'EXPENSE' && account.normal_balance === 'DEBIT');

  return (
    <Modal
      open={open}
      title={editing ? t('fixedAssets.form.editTitle') : t('fixedAssets.form.addTitle')}
      width={880}
      onCancel={onCancel}
      onOk={() => form.submit()}
      confirmLoading={loading}
      destroyOnHidden
      forceRender
    >
      <Form form={form} layout="vertical" requiredMark={false} onFinish={onSubmit} className="mt-4">
        <Divider titlePlacement="start">{t('fixedAssets.form.identity')}</Divider>
        <div className="grid grid-cols-1 gap-x-4 md:grid-cols-3">
          <Form.Item name="asset_code" label={t('fixedAssets.form.code')} rules={required}><Input className="uppercase" /></Form.Item>
          <Form.Item name="name" label={t('fixedAssets.form.name')} rules={required}><Input /></Form.Item>
          <Form.Item name="category" label={t('fixedAssets.form.category')} rules={required}>
            <Select options={categories.map((category) => ({ value: category, label: t(`fixedAssets.category.${category}`) }))} />
          </Form.Item>
          <Form.Item name="location" label={t('fixedAssets.form.location')}><Input /></Form.Item>
          <Form.Item name="description" label={t('fixedAssets.form.description')} className="md:col-span-2"><Input.TextArea rows={2} /></Form.Item>
        </div>

        <Divider titlePlacement="start">{t('fixedAssets.form.policy')}</Divider>
        <Alert type="info" showIcon className="mb-4" message={t('fixedAssets.form.policyWarning')} />
        <div className="grid grid-cols-1 gap-x-4 md:grid-cols-3">
          <Form.Item name="registration_type" label={t('fixedAssets.form.registration')} rules={required}>
            <Select disabled={locked} options={[{ value: 'NEW', label: t('fixedAssets.form.new') }, { value: 'EXISTING', label: t('fixedAssets.form.existing') }]} />
          </Form.Item>
          <Form.Item name="acquisition_date" label={t('fixedAssets.form.acquisitionDate')} rules={required}><DatePicker disabled={locked} className="w-full" /></Form.Item>
          <Form.Item name="available_for_use_date" label={t('fixedAssets.form.availableDate')} rules={required}><DatePicker disabled={locked} className="w-full" /></Form.Item>
          <Form.Item name="acquisition_cost" label={t('fixedAssets.form.cost')} rules={required}><InputNumber disabled={locked} min={0.01} className="w-full" /></Form.Item>
          <Form.Item name="residual_value" label={t('fixedAssets.form.residual')} rules={required}><InputNumber disabled={locked} min={0} className="w-full" /></Form.Item>
          <Form.Item name="useful_life_months" label={t('fixedAssets.form.life')} rules={required}><InputNumber disabled={locked} min={1} precision={0} className="w-full" /></Form.Item>
          <Form.Item label={t('fixedAssets.form.method')}><Input value={t('fixedAssets.form.straightLine')} readOnly /></Form.Item>
        </div>
        {policy ? (
          <div className="mb-4 grid grid-cols-1 gap-2 rounded-lg bg-blue-50 p-3 text-sm md:grid-cols-2 xl:grid-cols-4">
            <span>{t('fixedAssets.form.previewStart')}: <strong>{policy.depreciationStartDate}</strong></span>
            <span>{t('fixedAssets.form.previewRegular')}: <strong>{currency(policy.regularDepreciationAmount)}</strong></span>
            <span>{t('fixedAssets.form.previewBookValue')}: <strong>{currency((values?.acquisition_cost ?? 0) - (values?.opening_accumulated_depreciation ?? 0))}</strong></span>
            <span>{t('fixedAssets.form.previewEnd')}: <strong>{policy.depreciationEndDate}</strong></span>
          </div>
        ) : null}

        {registrationType === 'EXISTING' ? (
          <>
            <Divider titlePlacement="start">{t('fixedAssets.form.opening')}</Divider>
            <Alert type="warning" showIcon className="mb-4" message={t('fixedAssets.form.baselineWarning')} />
            <div className="grid grid-cols-1 gap-x-4 md:grid-cols-3">
              <Form.Item name="opening_balance_date" label={t('fixedAssets.form.openingDate')} rules={required}><DatePicker disabled={locked} className="w-full" /></Form.Item>
              <Form.Item name="opening_accumulated_depreciation" label={t('fixedAssets.form.openingAccumulated')} rules={required}><InputNumber disabled={locked} min={0} className="w-full" /></Form.Item>
              <Form.Item name="opening_remaining_useful_life_months" label={t('fixedAssets.form.remainingLife')} rules={required}><InputNumber disabled={locked} min={0} precision={0} className="w-full" /></Form.Item>
            </div>
          </>
        ) : null}

        <Divider titlePlacement="start">{t('fixedAssets.form.accounts')}</Divider>
        <div className="grid grid-cols-1 gap-x-4 md:grid-cols-3">
          <Form.Item name="asset_account_id" label={t('fixedAssets.form.assetAccount')} rules={required}><Select showSearch optionFilterProp="label" options={accountOptions(validAssetAccounts)} /></Form.Item>
          <Form.Item name="accumulated_depreciation_account_id" label={t('fixedAssets.form.accumulatedAccount')} rules={required}><Select showSearch optionFilterProp="label" options={accountOptions(validAccumulatedAccounts)} /></Form.Item>
          <Form.Item name="depreciation_expense_account_id" label={t('fixedAssets.form.expenseAccount')} rules={required}><Select showSearch optionFilterProp="label" options={accountOptions(validExpenseAccounts)} /></Form.Item>
          <Form.Item name="department_id" label={t('fixedAssets.form.department')}><Select allowClear showSearch optionFilterProp="label" options={departments.filter((item) => item.is_active).map((item) => ({ value: item.id, label: `${item.code ?? ''} ${item.name}`.trim() }))} /></Form.Item>
          <Form.Item name="project_id" label={t('fixedAssets.form.project')}><Select allowClear showSearch optionFilterProp="label" options={projects.filter((item) => item.is_active).map((item) => ({ value: item.id, label: `${item.code ?? ''} ${item.name}`.trim() }))} /></Form.Item>
          {(!editing || !hasPostedHistory) ? <Form.Item name="is_active" label={t('fixedAssets.form.isActive')} valuePropName="checked"><Switch /></Form.Item> : null}
        </div>
      </Form>
    </Modal>
  );
}
