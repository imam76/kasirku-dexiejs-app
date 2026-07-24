import { DatePicker, Form, Modal, Select } from 'antd';
import { useEffect } from 'react';
import type { Dayjs } from 'dayjs';
import { useI18n } from '@/hooks/useI18n';
import type { ChartOfAccount, Department, FixedAssetCategory, FixedAssetDerivedStatus, Project } from '@/types';
import type { FixedAssetActivityFilter } from '@/hooks/useFixedAssets';

export interface FixedAssetFilterValues {
  category: FixedAssetCategory | 'ALL';
  derivedStatus: FixedAssetDerivedStatus | 'ALL';
  activity: FixedAssetActivityFilter;
  departmentId?: string;
  projectId?: string;
  assetAccountId?: string;
  availableDateRange?: [Dayjs | null, Dayjs | null];
}

export default function FixedAssetFilterModal({ open, values, accounts, departments, projects, onCancel, onApply }: {
  open: boolean;
  values: FixedAssetFilterValues;
  accounts: ChartOfAccount[];
  departments: Department[];
  projects: Project[];
  onCancel: () => void;
  onApply: (values: FixedAssetFilterValues) => void;
}) {
  const { t } = useI18n();
  const [form] = Form.useForm<FixedAssetFilterValues>();
  useEffect(() => { if (open) form.setFieldsValue(values); }, [form, open, values]);
  const categories: FixedAssetCategory[] = ['BUILDING', 'VEHICLE', 'MACHINERY_EQUIPMENT', 'OFFICE_EQUIPMENT', 'FURNITURE', 'OTHER'];
  const statuses: FixedAssetDerivedStatus[] = ['NOT_STARTED', 'DEPRECIATING', 'FULLY_DEPRECIATED', 'ARCHIVED'];
  return (
    <Modal open={open} title={t('fixedAssets.filterTitle')} onCancel={onCancel} onOk={() => form.submit()} destroyOnHidden>
      <Form form={form} layout="vertical" onFinish={onApply} className="mt-4">
        <Form.Item name="category" label={t('fixedAssets.filter.category')}>
          <Select options={[{ value: 'ALL', label: t('fixedAssets.all') }, ...categories.map((value) => ({ value, label: t(`fixedAssets.category.${value}`) }))]} />
        </Form.Item>
        <Form.Item name="derivedStatus" label={t('fixedAssets.filter.derivedStatus')}>
          <Select options={[{ value: 'ALL', label: t('fixedAssets.all') }, ...statuses.map((value) => ({ value, label: t(`fixedAssets.status.${value}`) }))]} />
        </Form.Item>
        <Form.Item name="activity" label={t('fixedAssets.filter.activity')}>
          <Select options={[{ value: 'active', label: t('fixedAssets.active') }, { value: 'archived', label: t('fixedAssets.archived') }, { value: 'all', label: t('fixedAssets.all') }]} />
        </Form.Item>
        <div className="grid grid-cols-1 gap-x-3 md:grid-cols-2">
          <Form.Item name="departmentId" label={t('fixedAssets.filter.department')}>
            <Select allowClear showSearch optionFilterProp="label" options={departments.map((item) => ({ value: item.id, label: `${item.code ?? ''} ${item.name}`.trim() }))} />
          </Form.Item>
          <Form.Item name="projectId" label={t('fixedAssets.filter.project')}>
            <Select allowClear showSearch optionFilterProp="label" options={projects.map((item) => ({ value: item.id, label: `${item.code ?? ''} ${item.name}`.trim() }))} />
          </Form.Item>
          <Form.Item name="assetAccountId" label={t('fixedAssets.filter.assetAccount')}>
            <Select allowClear showSearch optionFilterProp="label" options={accounts.filter((item) => item.type === 'ASSET' && item.is_postable).map((item) => ({ value: item.id, label: `${item.code} - ${item.name}` }))} />
          </Form.Item>
          <Form.Item name="availableDateRange" label={t('fixedAssets.filter.availableRange')}>
            <DatePicker.RangePicker className="w-full" />
          </Form.Item>
        </div>
      </Form>
    </Modal>
  );
}
