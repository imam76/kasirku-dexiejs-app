import { useState } from 'react';
import { Button, DatePicker, Form, Input, Modal, Select, Switch, Tabs } from 'antd';
import type { FormInstance } from 'antd';
import type { Dayjs } from 'dayjs';
import { Plus, Trash2 } from 'lucide-react';
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
  const [activeTab, setActiveTab] = useState('employee');

  return (
    <Modal
      title={isEditing ? t('employees.editTitle') : t('employees.addTitle')}
      open={open}
      onCancel={onCancel}
      afterOpenChange={(isOpen) => {
        if (!isOpen) setActiveTab('employee');
      }}
      onOk={() => form.submit()}
      confirmLoading={isSubmitting}
      destroyOnHidden
      forceRender
      width={820}
      styles={{
        body: {
          maxHeight: 'calc(100vh - 200px)',
          overflowY: 'auto',
        },
      }}
    >
      <Form<EmployeeFormValues>
        form={form}
        layout="vertical"
        onFinish={onSubmit}
        onFinishFailed={({ errorFields }) => {
          const hasCollectionError = errorFields.some(({ name }) => (
            name[0] === 'area_ids' || name[0] === 'collection_schedules'
          ));
          setActiveTab(hasCollectionError ? 'collection' : 'employee');
        }}
        requiredMark={false}
        className="mt-4"
      >
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={[
            {
              key: 'employee',
              label: t('employees.form.employeeDataTab'),
              children: (
                <div className="pt-1">
                  <div className="grid grid-cols-1 gap-x-4 md:grid-cols-2">
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
                    <Form.Item name="phone" label={t('employees.form.phone')}>
                      <Input placeholder={t('employees.form.phonePlaceholder')} />
                    </Form.Item>
                    <Form.Item
                      name="email"
                      label={t('employees.form.email')}
                      rules={[
                        { required: Boolean(isPinRequired && loginPinValue), message: 'Email wajib diisi jika PIN login diisi.' },
                        { type: 'email', message: t('employees.validation.emailInvalid') },
                      ]}
                    >
                      <Input placeholder={t('employees.form.emailPlaceholder')} />
                    </Form.Item>
                  </div>

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
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
                      <div className="mb-2 mt-5 text-sm font-semibold text-gray-900 dark:text-gray-100">
                        Akses Login (Opsional)
                      </div>
                      <div className="grid grid-cols-1 gap-x-4 md:grid-cols-2">
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

                  <div className="grid grid-cols-1 gap-x-4 md:grid-cols-2">
                    <Form.Item name="address" label={t('employees.form.address')}>
                      <TextArea rows={2} placeholder={t('employees.form.addressPlaceholder')} />
                    </Form.Item>
                    <Form.Item name="notes" label={t('employees.form.notes')}>
                      <TextArea rows={2} placeholder={t('employees.form.notesPlaceholder')} />
                    </Form.Item>
                  </div>
                  <Form.Item name="is_active" label={t('employees.form.status')} valuePropName="checked">
                    <Switch checkedChildren={t('employees.status.active')} unCheckedChildren={t('employees.status.inactive')} />
                  </Form.Item>
                </div>
              ),
            },
            {
              key: 'collection',
              label: t('employees.form.collectionTab'),
              children: (
                <div className="pt-1">
                  <Form.Item name="area_ids" label={t('employees.form.areas')}>
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

                  <Form.List name="collection_schedules">
                    {(fields, { add, remove }) => (
                      <section className="border-t border-gray-200 pt-4 dark:border-gray-700">
                        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                              {t('employees.form.collectionSchedules')}
                            </div>
                            <div className="mt-0.5 text-xs leading-5 text-gray-500 dark:text-gray-400">
                              {t('employees.form.collectionSchedulesHint')}
                            </div>
                          </div>
                          <Button
                            type="dashed"
                            icon={<Plus size={16} />}
                            disabled={selectedAreaIds.length === 0}
                            className="shrink-0 sm:self-center"
                            onClick={() => add({ is_active: true })}
                          >
                            {t('employees.form.addCollectionSchedule')}
                          </Button>
                        </div>

                        {fields.length === 0 ? (
                          <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50/50 px-4 py-8 text-center text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-900/30 dark:text-gray-400">
                            {selectedAreaIds.length === 0
                              ? t('employees.form.collectionSchedulesSelectArea')
                              : t('employees.form.collectionSchedulesEmpty')}
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {fields.map((field, index) => (
                              <div
                                key={field.key}
                                className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900/60"
                              >
                                <Form.Item name={[field.name, 'id']} hidden>
                                  <Input />
                                </Form.Item>

                                <div className="mb-3 flex items-center justify-between gap-3 border-b border-gray-100 pb-2 dark:border-gray-800">
                                  <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                    {t('employees.form.collectionScheduleItem', { number: index + 1 })}
                                  </span>
                                  <Button
                                    danger
                                    type="text"
                                    size="small"
                                    icon={<Trash2 size={15} />}
                                    onClick={() => remove(field.name)}
                                  >
                                    {t('employees.form.removeCollectionSchedule')}
                                  </Button>
                                </div>

                                <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
                                  <Form.Item
                                    name={[field.name, 'area_id']}
                                    label={t('employees.form.scheduleArea')}
                                    rules={[{ required: true, message: t('employees.validation.scheduleAreaRequired') }]}
                                    className="mb-0"
                                  >
                                    <Select
                                      showSearch
                                      optionFilterProp="label"
                                      placeholder={t('employees.form.scheduleAreaPlaceholder')}
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
                                      placeholder={t('employees.form.scheduleDayPlaceholder')}
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
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </section>
                    )}
                  </Form.List>
                </div>
              ),
            },
          ]}
        />
      </Form>
    </Modal>
  );
}
