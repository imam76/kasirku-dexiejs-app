import { Form, Input, Modal, Select, Switch } from 'antd';
import type { FormInstance } from 'antd';
import { useI18n } from '@/hooks/useI18n';
import type { CooperativeArea, Role } from '@/types';

const { TextArea } = Input;

export interface EmployeeFormValues {
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  position?: string;
  login_role_id?: string;
  login_pin?: string;
  confirm_login_pin?: string;
  area_ids?: string[];
  notes?: string;
  is_active?: boolean;
}

interface EmployeeFormModalProps {
  form: FormInstance<EmployeeFormValues>;
  areas: CooperativeArea[];
  roles: Role[];
  open: boolean;
  isEditing: boolean;
  canManageLogin: boolean;
  isSubmitting: boolean;
  onCancel: () => void;
  onSubmit: (values: EmployeeFormValues) => void;
}

export default function EmployeeFormModal({
  form,
  areas,
  roles,
  open,
  isEditing,
  canManageLogin,
  isSubmitting,
  onCancel,
  onSubmit,
}: EmployeeFormModalProps) {
  const { t } = useI18n();
  const loginPinValue = Form.useWatch('login_pin', form);
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
