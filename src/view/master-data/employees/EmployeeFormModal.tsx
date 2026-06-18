import { Button, DatePicker, Form, Input, Modal, Select, Space, Switch } from 'antd';
import type { FormInstance } from 'antd';
import type { Dayjs } from 'dayjs';
import { Plus } from 'lucide-react';
import { useI18n } from '@/hooks/useI18n';
import type {
  ChartOfAccount,
  CooperativeArea,
  CooperativeCollectionWeekday,
  Role,
} from '@/types';
import {
  COOPERATIVE_COLLECTION_WEEKDAYS,
  getCollectionWeekdayLabel,
} from '@/utils/koperasi/collectionSchedule';

const { TextArea } = Input;

export interface EmployeeFormValues {
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  position?: string;
  login_role_id?: string;
  field_cash_account_id?: string;
  login_pin?: string;
  confirm_login_pin?: string;
  area_ids?: string[];
  collection_schedules?: Array<{
    id?: string;
    area_id: string;
    weekday: CooperativeCollectionWeekday;
    effective_from?: Dayjs;
    effective_until?: Dayjs;
    is_active?: boolean;
  }>;
  notes?: string;
  is_active?: boolean;
}

interface EmployeeFormModalProps {
  form: FormInstance<EmployeeFormValues>;
  areas: CooperativeArea[];
  roles: Role[];
  fieldCashAccounts: ChartOfAccount[];
  open: boolean;
  isEditing: boolean;
  canManageLogin: boolean;
  isSubmitting: boolean;
  isCreatingFieldCashAccount: boolean;
  onCancel: () => void;
  onSubmit: (values: EmployeeFormValues) => void;
  onCreateFieldCashAccount: (employeeName: string) => Promise<ChartOfAccount | undefined>;
}

export default function EmployeeFormModal({
  form,
  areas,
  roles,
  fieldCashAccounts,
  open,
  isEditing,
  canManageLogin,
  isSubmitting,
  isCreatingFieldCashAccount,
  onCancel,
  onSubmit,
  onCreateFieldCashAccount,
}: EmployeeFormModalProps) {
  const { t } = useI18n();
  const loginPinValue = Form.useWatch('login_pin', form);
  const employeeNameValue = Form.useWatch('name', form);
  const selectedAreaIds = Form.useWatch('area_ids', form) ?? [];
  const isPinRequired = !isEditing || Boolean(loginPinValue);

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
          <Form.Item 
            name="email" 
            label={t('employees.form.email')} 
            rules={[
              { required: Boolean(isPinRequired && loginPinValue), message: 'Email wajib diisi jika PIN login diisi.' },
              { type: 'email', message: t('employees.validation.emailInvalid') }
            ]}
          >
            <Input placeholder={t('employees.form.emailPlaceholder')} />
          </Form.Item>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Form.Item name="area_ids" label={t('employees.form.areas')} className="md:col-span-2">
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

        <div className="mb-2 mt-4 flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-gray-900">
              {t('employees.form.collectionSchedules')}
            </div>
            <div className="text-xs text-gray-500">
              {t('employees.form.collectionSchedulesHint')}
            </div>
          </div>
        </div>
        <Form.List name="collection_schedules">
          {(fields, { add, remove }) => (
            <Space orientation="vertical" className="w-full" size="middle">
              {fields.map((field) => (
                <div
                  key={field.key}
                  className="grid grid-cols-1 gap-3 rounded-lg border border-gray-200 p-3 md:grid-cols-[minmax(180px,1fr)_140px_150px_150px_auto]"
                >
                  <Form.Item name={[field.name, 'id']} hidden>
                    <Input />
                  </Form.Item>
                  <Form.Item
                    name={[field.name, 'area_id']}
                    label={t('employees.form.scheduleArea')}
                    rules={[{ required: true, message: t('employees.validation.scheduleAreaRequired') }]}
                    className="mb-0"
                  >
                    <Select
                      showSearch
                      optionFilterProp="label"
                      options={areas
                        .filter((area) => selectedAreaIds.includes(area.id))
                        .map((area) => ({
                          value: area.id,
                          label: area.code ? `${area.code} - ${area.name}` : area.name,
                        }))}
                    />
                  </Form.Item>
                  <Form.Item
                    name={[field.name, 'weekday']}
                    label={t('employees.form.scheduleDay')}
                    rules={[{ required: true, message: t('employees.validation.scheduleDayRequired') }]}
                    className="mb-0"
                  >
                    <Select
                      options={COOPERATIVE_COLLECTION_WEEKDAYS.map((weekday) => ({
                        value: weekday,
                        label: getCollectionWeekdayLabel(weekday),
                      }))}
                    />
                  </Form.Item>
                  <Form.Item
                    name={[field.name, 'effective_from']}
                    label={t('employees.form.effectiveFrom')}
                    className="mb-0"
                  >
                    <DatePicker className="w-full" />
                  </Form.Item>
                  <Form.Item
                    name={[field.name, 'effective_until']}
                    label={t('employees.form.effectiveUntil')}
                    className="mb-0"
                  >
                    <DatePicker className="w-full" />
                  </Form.Item>
                  <Button
                    danger
                    type="text"
                    className="self-end"
                    onClick={() => remove(field.name)}
                  >
                    Hapus
                  </Button>
                </div>
              ))}
              <Button
                type="dashed"
                icon={<Plus size={16} />}
                disabled={selectedAreaIds.length === 0}
                onClick={() => add({ is_active: true })}
              >
                {t('employees.form.addCollectionSchedule')}
              </Button>
            </Space>
          )}
        </Form.List>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
          <Form.Item name="field_cash_account_id" label="Akun Kas Petugas" className="mb-0">
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="Pilih akun kas petugas"
              options={fieldCashAccounts.map((account) => ({
                value: account.id,
                label: `${account.code} - ${account.name}`,
              }))}
            />
          </Form.Item>
          <Button
            icon={<Plus size={16} />}
            loading={isCreatingFieldCashAccount}
            disabled={!employeeNameValue?.trim()}
            onClick={async () => {
              const account = await onCreateFieldCashAccount(employeeNameValue ?? '');
              if (account) {
                form.setFieldsValue({ field_cash_account_id: account.id });
              }
            }}
          >
            Buat Akun
          </Button>
        </div>

        {canManageLogin ? (
          <>
            <div className="mb-2 mt-4 text-sm font-semibold text-gray-900">Akses Login (Opsional)</div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Form.Item
                name="login_role_id"
                label="Role Login"
                rules={[{ required: Boolean(isPinRequired && loginPinValue), message: 'Role login wajib dipilih jika PIN diisi.' }]}
              >
                <Select
                  showSearch
                  allowClear
                  optionFilterProp="label"
                  placeholder="Pilih role login"
                  options={roles.map((role) => ({
                    value: role.id,
                    label: role.name,
                    disabled: !role.is_active,
                  }))}
                />
              </Form.Item>
              <Form.Item
                name="login_pin"
                label={isEditing ? 'PIN Login Baru (Isi untuk mengubah)' : 'PIN Login'}
                preserve={false}
                rules={[
                  { required: !isEditing && Boolean(form.getFieldValue('login_role_id')), message: 'PIN login wajib diisi jika role dipilih.' },
                  { min: 4, message: 'PIN minimal 4 digit.' },
                  { pattern: /^\d+$/, message: 'PIN hanya boleh angka.' },
                ]}
              >
                <Input.Password inputMode="numeric" placeholder="Masukkan PIN" />
              </Form.Item>
              {loginPinValue && (
                <Form.Item
                  name="confirm_login_pin"
                  label="Konfirmasi PIN"
                  preserve={false}
                  dependencies={['login_pin']}
                  rules={[
                    { required: true, message: 'Konfirmasi PIN wajib diisi.' },
                    ({ getFieldValue }) => ({
                      validator(_, value) {
                        if (!value || getFieldValue('login_pin') === value) {
                          return Promise.resolve();
                        }
                        return Promise.reject(new Error('Konfirmasi PIN tidak sama.'));
                      },
                    }),
                  ]}
                  className="md:col-start-2"
                >
                  <Input.Password inputMode="numeric" placeholder="Ulangi PIN" />
                </Form.Item>
              )}
            </div>
          </>
        ) : null}



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
