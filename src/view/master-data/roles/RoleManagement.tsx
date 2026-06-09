import { useMemo, useState } from 'react';
import { App, Button, Card, Checkbox, Form, Input, Modal, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { Edit2, KeyRound, Plus, ShieldCheck, UserCheck, UserX } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { getEnabledPermissionCatalog } from '@/auth/permissionCatalog';
import dayjs from '@/lib/dayjs';
import {
  createRole,
  getRoleWithPermissions,
  listRolesWithPermissionCounts,
  setRoleActive,
  updateRole,
  updateRolePermissions,
} from '@/services/roleService';
import type { Permission, Role } from '@/types';

const { Text } = Typography;
const { TextArea } = Input;

interface RoleFormValues {
  name: string;
  description?: string;
}

type RoleRow = Role & { permission_count: number };

export default function RoleManagement() {
  const { message, modal } = App.useApp();
  const [roleForm] = Form.useForm<RoleFormValues>();
  const [isRoleModalOpen, setIsRoleModalOpen] = useState(false);
  const [isPermissionModalOpen, setIsPermissionModalOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [permissionRole, setPermissionRole] = useState<Role | null>(null);
  const [selectedPermissions, setSelectedPermissions] = useState<Permission[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const roles = useLiveQuery(
    () => listRolesWithPermissionCounts(),
    [],
    [],
  );

  const catalogGroups = useMemo(() => {
    const groups = new Map<string, ReturnType<typeof getEnabledPermissionCatalog>>();
    getEnabledPermissionCatalog().forEach((item) => {
      const items = groups.get(item.group) ?? [];
      items.push(item);
      groups.set(item.group, items);
    });
    return Array.from(groups.entries());
  }, []);

  const closeRoleModal = () => {
    setIsRoleModalOpen(false);
    setEditingRole(null);
    roleForm.resetFields();
  };

  const openAddRole = () => {
    setEditingRole(null);
    roleForm.resetFields();
    setIsRoleModalOpen(true);
  };

  const openEditRole = (role: Role) => {
    setEditingRole(role);
    roleForm.setFieldsValue({
      name: role.name,
      description: role.description,
    });
    setIsRoleModalOpen(true);
  };

  const openPermissionModal = async (role: Role) => {
    try {
      const roleWithPermissions = await getRoleWithPermissions(role.id);
      setPermissionRole(role);
      setSelectedPermissions(roleWithPermissions.permissions);
      setIsPermissionModalOpen(true);
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Gagal membuka permission role.');
    }
  };

  const handleSubmitRole = async (values: RoleFormValues) => {
    try {
      setIsSubmitting(true);
      if (editingRole) {
        await updateRole(editingRole.id, values);
        message.success('Role berhasil diperbarui.');
      } else {
        await createRole(values);
        message.success('Role berhasil ditambahkan.');
      }
      closeRoleModal();
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Gagal menyimpan role.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmitPermissions = async () => {
    if (!permissionRole) return;

    try {
      setIsSubmitting(true);
      await updateRolePermissions(permissionRole.id, selectedPermissions);
      message.success('Permission role berhasil diperbarui.');
      setIsPermissionModalOpen(false);
      setPermissionRole(null);
      setSelectedPermissions([]);
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Gagal menyimpan permission role.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleActive = (role: Role) => {
    const nextActive = !role.is_active;
    modal.confirm({
      title: nextActive ? 'Aktifkan role?' : 'Nonaktifkan role?',
      content: `${role.name} akan ${nextActive ? 'diaktifkan kembali' : 'dinonaktifkan'}.`,
      okText: nextActive ? 'Aktifkan' : 'Nonaktifkan',
      okType: nextActive ? 'primary' : 'danger',
      cancelText: 'Batal',
      onOk: async () => {
        try {
          await setRoleActive(role.id, nextActive);
          message.success(nextActive ? 'Role berhasil diaktifkan.' : 'Role berhasil dinonaktifkan.');
        } catch (error) {
          message.error(error instanceof Error ? error.message : 'Gagal mengubah status role.');
        }
      },
    });
  };

  const columns: ColumnsType<RoleRow> = [
    {
      title: 'Role',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, role) => (
        <Space orientation="vertical" size={0}>
          <Text strong>{name}</Text>
          {role.description && <Text type="secondary">{role.description}</Text>}
        </Space>
      ),
    },
    {
      title: 'Tipe',
      key: 'type',
      render: (_value, role) => (
        <Space>
          {role.is_system ? <Tag color="blue">System</Tag> : <Tag>Custom</Tag>}
          {role.is_owner && <Tag color="gold">Owner</Tag>}
        </Space>
      ),
    },
    {
      title: 'Permission',
      dataIndex: 'permission_count',
      key: 'permission_count',
      render: (count: number, role) => (
        role.is_owner ? <Text type="secondary">Semua module aktif</Text> : <Tag>{count} permission</Tag>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'is_active',
      key: 'is_active',
      render: (isActive: boolean) => (isActive ? <Tag color="green">Aktif</Tag> : <Tag>Nonaktif</Tag>),
    },
    {
      title: 'Diubah',
      dataIndex: 'updated_at',
      key: 'updated_at',
      render: (updatedAt: string) => dayjs(updatedAt).tz().format('DD MMM YYYY, HH:mm'),
    },
    {
      title: 'Aksi',
      key: 'action',
      render: (_value, role) => (
        <Space wrap>
          <Button type="text" icon={<Edit2 size={16} />} disabled={role.is_owner} onClick={() => openEditRole(role)}>
            Edit
          </Button>
          <Button type="text" icon={<KeyRound size={16} />} disabled={role.is_owner} onClick={() => openPermissionModal(role)}>
            Permission
          </Button>
          <Button
            danger={role.is_active}
            type="text"
            icon={role.is_active ? <UserX size={16} /> : <UserCheck size={16} />}
            disabled={role.is_system}
            onClick={() => handleToggleActive(role)}
          >
            {role.is_active ? 'Nonaktifkan' : 'Aktifkan'}
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <Card
      className="shadow-md"
      title={(
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5" />
          Manajemen Role
        </div>
      )}
      extra={(
        <Button type="primary" icon={<Plus size={16} />} onClick={openAddRole}>
          Tambah Role
        </Button>
      )}
    >
      <Table
        dataSource={roles}
        columns={columns}
        rowKey="id"
        pagination={{ pageSize: 8 }}
        scroll={{ x: true }}
      />

      <Modal
        title={editingRole ? 'Edit Role' : 'Tambah Role'}
        open={isRoleModalOpen}
        onCancel={closeRoleModal}
        onOk={() => roleForm.submit()}
        confirmLoading={isSubmitting}
        destroyOnHidden
        forceRender
      >
        <Form<RoleFormValues>
          form={roleForm}
          layout="vertical"
          onFinish={handleSubmitRole}
          requiredMark={false}
          className="mt-4"
        >
          <Form.Item
            name="name"
            label="Nama Role"
            rules={[
              { required: true, whitespace: true, message: 'Nama role wajib diisi.' },
              { min: 2, message: 'Nama minimal 2 karakter.' },
            ]}
          >
            <Input placeholder="Contoh: Penagihan" />
          </Form.Item>
          <Form.Item name="description" label="Deskripsi">
            <TextArea rows={3} placeholder="Contoh: Akses untuk petugas penagihan koperasi" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={permissionRole ? `Permission - ${permissionRole.name}` : 'Permission Role'}
        open={isPermissionModalOpen}
        onCancel={() => setIsPermissionModalOpen(false)}
        onOk={handleSubmitPermissions}
        confirmLoading={isSubmitting}
        destroyOnHidden
        width={860}
      >
        <Space direction="vertical" className="w-full" size="middle">
          {catalogGroups.map(([group, items]) => (
            <div key={group} className="rounded-md border border-gray-100 p-3">
              <Text strong>{group}</Text>
              <Checkbox.Group
                className="mt-3 grid w-full grid-cols-1 gap-2 md:grid-cols-2"
                value={selectedPermissions}
                onChange={(values) => setSelectedPermissions(values as Permission[])}
              >
                {items.map((item) => (
                  <Checkbox key={item.code} value={item.code}>
                    <Space size={6} wrap>
                      <span>{item.label}</span>
                      {item.isSensitive && <Tag color="red">Sensitive</Tag>}
                    </Space>
                  </Checkbox>
                ))}
              </Checkbox.Group>
            </div>
          ))}
        </Space>
      </Modal>
    </Card>
  );
}
