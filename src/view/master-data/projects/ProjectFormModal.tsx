import { DatePicker, Form, Input, InputNumber, Modal, Select, Switch } from 'antd';
import type { FormInstance } from 'antd';
import type { Dayjs } from 'dayjs';
import { useI18n } from '@/hooks/useI18n';
import type { Contact, Department, ProjectStatus } from '@/types';
import { getContactLabel, getDepartmentLabel } from './projectFormatters';
import { projectStatusOptions } from './projectOptions';

const { TextArea } = Input;

export interface ProjectFormValues {
  name: string;
  code?: string;
  status: ProjectStatus;
  contact_id?: string;
  department_id?: string;
  start_date?: Dayjs | null;
  end_date?: Dayjs | null;
  budget_amount?: number;
  description?: string;
  is_active?: boolean;
}

interface ProjectFormModalProps {
  form: FormInstance<ProjectFormValues>;
  open: boolean;
  isEditing: boolean;
  isSubmitting: boolean;
  activeContacts: Contact[];
  activeDepartments: Department[];
  onCancel: () => void;
  onSubmit: (values: ProjectFormValues) => void;
}

export default function ProjectFormModal({
  form,
  open,
  isEditing,
  isSubmitting,
  activeContacts,
  activeDepartments,
  onCancel,
  onSubmit,
}: ProjectFormModalProps) {
  const { t } = useI18n();
  const contactOptions = activeContacts.map((contact) => ({
    value: contact.id,
    label: getContactLabel(contact),
  }));
  const departmentOptions = activeDepartments.map((department) => ({
    value: department.id,
    label: getDepartmentLabel(department),
  }));

  return (
    <Modal
      title={isEditing ? t('projects.editTitle') : t('projects.addTitle')}
      open={open}
      onCancel={onCancel}
      onOk={() => form.submit()}
      confirmLoading={isSubmitting}
      destroyOnHidden
      forceRender
      width={820}
    >
      <Form<ProjectFormValues>
        form={form}
        layout="vertical"
        onFinish={onSubmit}
        requiredMark={false}
        className="mt-4"
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Form.Item name="name" label={t('projects.form.name')} rules={[{ required: true, whitespace: true, message: t('projects.validation.nameRequired') }]}>
            <Input placeholder={t('projects.form.namePlaceholder')} />
          </Form.Item>
          <Form.Item name="code" label={t('projects.form.code')} rules={[{ max: 30, message: t('projects.validation.codeMax') }]}>
            <Input placeholder={t('projects.form.codePlaceholder')} />
          </Form.Item>
          <Form.Item name="status" label={t('projects.form.status')} rules={[{ required: true, message: t('projects.validation.statusRequired') }]}>
            <Select options={projectStatusOptions.map((option) => ({ value: option.value, label: t(option.labelKey) }))} />
          </Form.Item>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Form.Item name="contact_id" label={t('projects.form.contact')}>
            <Select allowClear showSearch={{ optionFilterProp: 'label' }} options={contactOptions} placeholder={t('projects.form.contactPlaceholder')} />
          </Form.Item>
          <Form.Item name="department_id" label={t('projects.form.department')}>
            <Select allowClear showSearch={{ optionFilterProp: 'label' }} options={departmentOptions} placeholder={t('projects.form.departmentPlaceholder')} />
          </Form.Item>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Form.Item name="start_date" label={t('projects.form.startDate')}>
            <DatePicker className="w-full" />
          </Form.Item>
          <Form.Item
            name="end_date"
            label={t('projects.form.endDate')}
            dependencies={['start_date']}
            rules={[
              ({ getFieldValue }) => ({
                validator(_, value: Dayjs | null) {
                  const startDate = getFieldValue('start_date') as Dayjs | null;
                  if (!startDate || !value || !value.isBefore(startDate, 'day')) {
                    return Promise.resolve();
                  }
                  return Promise.reject(new Error(t('projects.validation.endDateAfterStart')));
                },
              }),
            ]}
          >
            <DatePicker className="w-full" />
          </Form.Item>
          <Form.Item name="budget_amount" label={t('projects.form.budget')} rules={[{ type: 'number', min: 0, message: t('projects.validation.budgetMin') }]}>
            <InputNumber min={0} className="w-full" prefix="Rp" />
          </Form.Item>
        </div>

        <Form.Item name="description" label={t('projects.form.description')}>
          <TextArea rows={3} placeholder={t('projects.form.descriptionPlaceholder')} />
        </Form.Item>
        <Form.Item name="is_active" label={t('projects.form.activeStatus')} valuePropName="checked">
          <Switch checkedChildren={t('projects.activeStatus.active')} unCheckedChildren={t('projects.activeStatus.inactive')} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
