import { useState } from 'react';
import { App, Button, Card, Form, Input, Modal, Select, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { Edit2, KeyRound, Plus, UserCheck, UserRoundCog, UserX } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { createAuthUser, normalizeAuthEmail, resetAuthUserPin, setAuthUserActive, updateAuthUser } from '@/auth/authService';
import { ROLE_LABEL } from '@/auth/permissions';
import { resolveLegacyRoleId } from '@/auth/roleSeed';
import { useAuth } from '@/auth/useAuth';
import { db } from '@/lib/db';
import dayjs from '@/lib/dayjs';
import type { AuthUser, Role, UserRole } from '@/types';

const { Text } = Typography;

interface UserFormValues {
  name: string;
  email: string;
  role_id: string;
  pin?: string;
  confirmPin?: string;
}

interface ResetPinFormValues {
  pin: string;
  confirmPin: string;
}

const roleColor: Record<UserRole, string> = {
  OWNER: 'gold',
  ADMIN: 'blue',
  KASIR: 'green',
  GUDANG: 'cyan',
};

const roleOptions = (Object.keys(ROLE_LABEL) as UserRole[]).map((role) => ({
  value: resolveLegacyRoleId(role),
  label: ROLE_LABEL[role],
}));

export const UserManagement = () => {
  const { message, modal } = App.useApp();
  const { currentUser, refreshCurrentUser } = useAuth();
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<AuthUser | null>(null);
  const [pinTargetUser, setPinTargetUser] = useState<AuthUser | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [userForm] = Form.useForm<UserFormValues>();
  const [pinForm] = Form.useForm<ResetPinFormValues>();

  const users = useLiveQuery(
    () => db.authUsers.orderBy('created_at').reverse().toArray(),
    [],
    [],
  );
  const roles = useLiveQuery(
    () => db.roles.filter((role) => role.is_active).toArray(),
    [],
    [],
  );
  const activeRoleOptions = (roles && roles.length > 0 ? roles : []).map((role: Role) => ({
    value: role.id,
    label: role.name,
  }));
  const selectRoleOptions = activeRoleOptions.length > 0 ? activeRoleOptions : roleOptions;

  const closeUserModal = () => {
    setIsUserModalOpen(false);
    setEditingUser(null);
    userForm.resetFields();
  };

  const closePinModal = () => {
    setIsPinModalOpen(false);
    setPinTargetUser(null);
    pinForm.resetFields();
  };

  const handleAddUser = () => {
    setEditingUser(null);
    userForm.resetFields();
    userForm.setFieldsValue({ role_id: resolveLegacyRoleId('KASIR') });
    setIsUserModalOpen(true);
  };

  const handleEditUser = (user: AuthUser) => {
    setEditingUser(user);
    userForm.resetFields();
    userForm.setFieldsValue({
      name: user.name,
      email: user.email,
      role_id: user.role_id ?? resolveLegacyRoleId(user.role),
    });
    setIsUserModalOpen(true);
  };

  const handleResetPin = (user: AuthUser) => {
    setPinTargetUser(user);
    pinForm.resetFields();
    setIsPinModalOpen(true);
  };

  const handleSubmitUser = async (values: UserFormValues) => {
    try {
      setIsSubmitting(true);

      if (editingUser) {
        await updateAuthUser({
          userId: editingUser.id,
          name: values.name,
          email: normalizeAuthEmail(values.email),
          role_id: values.role_id,
        });

        if (editingUser.id === currentUser?.id) {
          await refreshCurrentUser();
        }

        message.success('User berhasil diperbarui.');
        closeUserModal();
        return;
      }

      if (!values.pin || values.pin !== values.confirmPin) {
        message.error('Konfirmasi PIN tidak sama.');
        return;
      }

      await createAuthUser({
        name: values.name,
        email: normalizeAuthEmail(values.email),
        role_id: values.role_id,
        pin: values.pin,
      });
      message.success('User berhasil ditambahkan.');
      closeUserModal();
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Gagal menyimpan user.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmitPin = async (values: ResetPinFormValues) => {
    if (!pinTargetUser) return;

    if (values.pin !== values.confirmPin) {
      message.error('Konfirmasi PIN tidak sama.');
      return;
    }

    try {
      setIsSubmitting(true);
      await resetAuthUserPin({
        userId: pinTargetUser.id,
        pin: values.pin,
      });
      message.success('PIN berhasil direset.');
      closePinModal();
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Gagal reset PIN.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleActive = (user: AuthUser) => {
    const nextActive = !user.is_active;

    modal.confirm({
      title: nextActive ? 'Aktifkan user?' : 'Nonaktifkan user?',
      content: `${user.name} akan ${nextActive ? 'diaktifkan kembali' : 'dinonaktifkan'}.`,
      okText: nextActive ? 'Aktifkan' : 'Nonaktifkan',
      okType: nextActive ? 'primary' : 'danger',
      cancelText: 'Batal',
      onOk: async () => {
        try {
          await setAuthUserActive(user.id, nextActive);
          message.success(nextActive ? 'User berhasil diaktifkan.' : 'User berhasil dinonaktifkan.');
        } catch (error) {
          message.error(error instanceof Error ? error.message : 'Gagal mengubah status user.');
        }
      },
    });
  };

  const columns: ColumnsType<AuthUser> = [
    {
      title: 'Nama',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, user) => (
        <Space orientation="vertical" size={0}>
          <Text strong>{name}</Text>
          {user.id === currentUser?.id && <Text type="secondary">Sedang login</Text>}
        </Space>
      ),
    },
    {
      title: 'Email',
      dataIndex: 'email',
      key: 'email',
      render: (email?: string) => email || '-',
    },
    {
      title: 'Role',
      dataIndex: 'role',
      key: 'role',
      render: (role: UserRole, user) => (
        <Tag color={roleColor[role] ?? 'default'}>{user.role_name ?? ROLE_LABEL[role] ?? role}</Tag>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'is_active',
      key: 'is_active',
      render: (isActive: boolean) => (
        isActive ? <Tag color="green">Aktif</Tag> : <Tag>Nonaktif</Tag>
      ),
    },
    {
      title: 'Dibuat',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (createdAt: string) => dayjs(createdAt).tz().format('DD MMM YYYY, HH:mm'),
    },
    {
      title: 'Aksi',
      key: 'action',
      render: (_value: unknown, user) => {
        const isCurrentUser = user.id === currentUser?.id;

        return (
          <Space wrap>
            <Button
              type="text"
              icon={<Edit2 size={16} />}
              onClick={() => handleEditUser(user)}
            >
              Edit
            </Button>
            <Button
              type="text"
              icon={<KeyRound size={16} />}
              onClick={() => handleResetPin(user)}
            >
              Reset PIN
            </Button>
            <Button
              danger={user.is_active}
              type="text"
              icon={user.is_active ? <UserX size={16} /> : <UserCheck size={16} />}
              disabled={isCurrentUser && user.is_active}
              onClick={() => handleToggleActive(user)}
            >
              {user.is_active ? 'Nonaktifkan' : 'Aktifkan'}
            </Button>
          </Space>
        );
      },
    },
  ];

  return (
    <Card
      className="shadow-md"
      title={(
        <div className="flex items-center gap-2">
          <UserRoundCog className="h-5 w-5" />
          User dan Hak Akses
        </div>
      )}
      extra={(
        <Button type="primary" icon={<Plus size={16} />} onClick={handleAddUser}>
          Tambah User
        </Button>
      )}
    >
      <Table
        dataSource={users}
        columns={columns}
        rowKey="id"
        pagination={{ pageSize: 8 }}
        scroll={{ x: true }}
      />

      <Modal
        title={editingUser ? 'Edit User' : 'Tambah User'}
        open={isUserModalOpen}
        onCancel={closeUserModal}
        onOk={() => userForm.submit()}
        confirmLoading={isSubmitting}
        destroyOnHidden
        forceRender
      >
        <Form<UserFormValues>
          form={userForm}
          layout="vertical"
          onFinish={handleSubmitUser}
          initialValues={{ role_id: resolveLegacyRoleId('KASIR') }}
          className="mt-4"
          requiredMark={false}
        >
          <Form.Item
            name="name"
            label="Nama User"
            rules={[
              { required: true, message: 'Nama user wajib diisi.' },
              { min: 2, message: 'Nama minimal 2 karakter.' },
            ]}
          >
            <Input placeholder="Contoh: Kasir 1" />
          </Form.Item>

          <Form.Item
            name="email"
            label="Email"
            rules={[
              { required: true, message: 'Email wajib diisi.' },
              { type: 'email', message: 'Format email tidak valid.' },
            ]}
          >
            <Input placeholder="Contoh: user@toko.com" />
          </Form.Item>

          <Form.Item
            name="role_id"
            label="Role"
            rules={[{ required: true, message: 'Role wajib dipilih.' }]}
          >
            <Select options={selectRoleOptions} />
          </Form.Item>

          {!editingUser && (
            <>
              <Form.Item
                name="pin"
                label="PIN"
                preserve={false}
                rules={[
                  { required: true, message: 'PIN wajib diisi.' },
                  { min: 4, message: 'PIN minimal 4 digit.' },
                  { pattern: /^\d+$/, message: 'PIN hanya boleh angka.' },
                ]}
              >
                <Input.Password inputMode="numeric" placeholder="Masukkan PIN" />
              </Form.Item>

              <Form.Item
                name="confirmPin"
                label="Konfirmasi PIN"
                preserve={false}
                dependencies={['pin']}
                rules={[
                  { required: true, message: 'Konfirmasi PIN wajib diisi.' },
                  ({ getFieldValue }) => ({
                    validator(_, value) {
                      if (!value || getFieldValue('pin') === value) {
                        return Promise.resolve();
                      }
                      return Promise.reject(new Error('Konfirmasi PIN tidak sama.'));
                    },
                  }),
                ]}
              >
                <Input.Password inputMode="numeric" placeholder="Ulangi PIN" />
              </Form.Item>
            </>
          )}
        </Form>
      </Modal>

      <Modal
        title={pinTargetUser ? `Reset PIN - ${pinTargetUser.name}` : 'Reset PIN'}
        open={isPinModalOpen}
        onCancel={closePinModal}
        onOk={() => pinForm.submit()}
        confirmLoading={isSubmitting}
        destroyOnHidden
        forceRender
      >
        <Form<ResetPinFormValues>
          form={pinForm}
          layout="vertical"
          onFinish={handleSubmitPin}
          className="mt-4"
          requiredMark={false}
        >
          <Form.Item
            name="pin"
            label="PIN Baru"
            rules={[
              { required: true, message: 'PIN baru wajib diisi.' },
              { min: 4, message: 'PIN minimal 4 digit.' },
              { pattern: /^\d+$/, message: 'PIN hanya boleh angka.' },
            ]}
          >
            <Input.Password inputMode="numeric" placeholder="Masukkan PIN baru" />
          </Form.Item>

          <Form.Item
            name="confirmPin"
            label="Konfirmasi PIN Baru"
            dependencies={['pin']}
            rules={[
              { required: true, message: 'Konfirmasi PIN baru wajib diisi.' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('pin') === value) {
                    return Promise.resolve();
                  }
                  return Promise.reject(new Error('Konfirmasi PIN tidak sama.'));
                },
              }),
            ]}
          >
            <Input.Password inputMode="numeric" placeholder="Ulangi PIN baru" />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
};
