import { Form, Input, Modal, Select, Switch } from 'antd';
import type { FormInstance } from 'antd';
import { useI18n } from '@/hooks/useI18n';
import type { AuthUser, CooperativeArea, Role } from '@/types';

const { TextArea } = Input;

export interface EmployeeFormValues {
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  position?: string;
  user_id?: string;
  create_login?: boolean;
  login_role_id?: string;
  login_pin?: string;
  confirm_login_pin?: string;
  reset_login_pin?: boolean;
  area_ids?: string[];
  notes?: string;
  is_active?: boolean;
}

interface EmployeeFormModalProps {
  form: FormInstance<EmployeeFormValues>;
  areas: CooperativeArea[];
  authUsers: AuthUser[];
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
  authUsers,
  roles,
  open,
  isEditing,
  canManageLogin,
  isSubmitting,
  onCancel,
  onSubmit,
}: EmployeeFormModalProps) {
  const { t } = useI18n();
  const createLogin = Form.useWatch('create_login', form);
  const resetLoginPin = Form.useWatch('reset_login_pin', form);
  const selectedUserId = Form.useWatch('user_id', form);
  const selectedUser = authUsers.find((user) => user.id === selectedUserId);
  const getLoginRoleId = (user: AuthUser | undefined) => (
    user?.role_id ?? roles.find((role) => role.code === user?.role)?.id
  );
  const showExistingLoginControls = canManageLogin && isEditing && Boolean(selectedUser);
  const showCreateLoginControls = canManageLogin && (!isEditing || !selectedUserId);
  const showPinFields = Boolean(createLogin || resetLoginPin);

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
          <Form.Item name="email" label={t('employees.form.email')} rules={[{ type: 'email', message: t('employees.validation.emailInvalid') }]}>
            <Input placeholder={t('employees.form.emailPlaceholder')} />
          </Form.Item>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {canManageLogin ? (
            <Form.Item name="user_id" label={t('employees.form.user')}>
              <Select
                allowClear
                showSearch
                disabled={Boolean(createLogin)}
                optionFilterProp="label"
                placeholder={t('employees.form.userPlaceholder')}
                options={authUsers.map((user) => ({
                  value: user.id,
                  label: `${user.name} (${user.role_name ?? user.role})`,
                  disabled: !user.is_active,
                }))}
                onChange={(userId) => {
                  const user = authUsers.find((item) => item.id === userId);
                  form.setFieldsValue({
                    login_role_id: getLoginRoleId(user),
                    reset_login_pin: false,
                    login_pin: undefined,
                    confirm_login_pin: undefined,
                  });
                }}
              />
            </Form.Item>
          ) : null}
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
        </div>

        {showCreateLoginControls ? (
          <>
            <Form.Item name="create_login" label="Beri akses login" valuePropName="checked">
              <Switch
                checkedChildren="Ya"
                unCheckedChildren="Tidak"
                onChange={(checked) => {
                  if (checked) {
                    form.setFieldsValue({
                      user_id: undefined,
                      reset_login_pin: false,
                      login_pin: undefined,
                      confirm_login_pin: undefined,
                    });
                  }
                }}
              />
            </Form.Item>

            {createLogin && (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Form.Item
                  name="login_role_id"
                  label="Role Login"
                  rules={[{ required: true, message: 'Role login wajib dipilih.' }]}
                >
                  <Select
                    showSearch
                    optionFilterProp="label"
                    placeholder="Pilih role login"
                    options={roles.map((role) => ({
                      value: role.id,
                      label: role.name,
                      disabled: !role.is_active,
                    }))}
                  />
                </Form.Item>
              </div>
            )}
          </>
        ) : null}

        {showExistingLoginControls ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Form.Item
              name="login_role_id"
              label="Role Login"
              rules={[{ required: true, message: 'Role login wajib dipilih.' }]}
            >
              <Select
                showSearch
                optionFilterProp="label"
                placeholder="Pilih role login"
                options={roles.map((role) => ({
                  value: role.id,
                  label: role.name,
                  disabled: !role.is_active,
                }))}
              />
            </Form.Item>
            <Form.Item name="reset_login_pin" label="Reset PIN Login" valuePropName="checked">
              <Switch
                checkedChildren="Ya"
                unCheckedChildren="Tidak"
                onChange={(checked) => {
                  if (!checked) {
                    form.setFieldsValue({
                      login_pin: undefined,
                      confirm_login_pin: undefined,
                    });
                  }
                }}
              />
            </Form.Item>
          </div>
        ) : null}

        {showPinFields ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Form.Item
              name="login_pin"
              label={createLogin ? 'PIN Login' : 'PIN Login Baru'}
              preserve={false}
              rules={[
                { required: true, message: 'PIN login wajib diisi.' },
                { min: 4, message: 'PIN minimal 4 digit.' },
                { pattern: /^\d+$/, message: 'PIN hanya boleh angka.' },
              ]}
            >
              <Input.Password inputMode="numeric" placeholder="Masukkan PIN" />
            </Form.Item>
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
            >
              <Input.Password inputMode="numeric" placeholder="Ulangi PIN" />
            </Form.Item>
          </div>
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
