import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  App,
  Button,
  Card,
  Descriptions,
  Drawer,
  Empty,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Spin,
  Switch,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table';
import { useLiveQuery } from 'dexie-react-hooks';
import { Eye, Pencil, Plus, Power, RotateCcw } from 'lucide-react';
import { db } from '@/lib/db';
import type { HrDepartmentInput, HrPositionInput } from '@/lib/validations/hr';
import {
  createHrDepartment,
  createHrPosition,
  updateHrDepartment,
  updateHrPosition,
} from '@/services/hrService';
import type { Department, Employee, HrPosition } from '@/types';

const { Title, Text } = Typography;

type StatusFilter = 'ACTIVE' | 'INACTIVE' | 'ALL';

interface OrganizationResult {
  departments: Department[];
  positions: HrPosition[];
  employees: Employee[];
}

const useOrganizationData = () => useLiveQuery(async () => {
  try {
    const [departments, positions, employees] = await Promise.all([
      db.departments.orderBy('name').toArray(),
      db.hrPositions.orderBy('name').toArray(),
      db.employees.orderBy('name').toArray(),
    ]);
    return { data: { departments, positions, employees } };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Struktur organisasi gagal dimuat.' };
  }
}, []);

const createDepartmentDepthMap = (departments: Department[]) => {
  const byId = new Map(departments.map((department) => [department.id, department]));
  return new Map(departments.map((department) => {
    let depth = 0;
    let parentId = department.parent_department_id;
    const visited = new Set<string>();
    while (parentId && depth < 10 && !visited.has(parentId)) {
      visited.add(parentId);
      depth += 1;
      parentId = byId.get(parentId)?.parent_department_id;
    }
    return [department.id, depth];
  }));
};

export function HrDepartmentManagement() {
  const { message } = App.useApp();
  const [form] = Form.useForm<HrDepartmentInput>();
  const result = useOrganizationData();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('ALL');
  const [editing, setEditing] = useState<Department | null>(null);
  const [detail, setDetail] = useState<Department | null>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const data: OrganizationResult = result?.data ?? { departments: [], positions: [], employees: [] };
  const depthMap = useMemo(() => createDepartmentDepthMap(data.departments), [data.departments]);
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return data.departments.filter((department) => (
      (!query || [department.code, department.name, department.head_employee_name, department.parent_department_name]
        .some((value) => value?.toLowerCase().includes(query))) &&
      (status === 'ALL' || department.is_active === (status === 'ACTIVE'))
    ));
  }, [data.departments, search, status]);

  useEffect(() => setPage(1), [search, status]);

  const activeEmployees = data.employees.filter((employee) => (
    employee.is_active && (employee.active_status ?? 'ACTIVE') === 'ACTIVE'
  ));
  const activeDepartments = data.departments.filter((department) => department.is_active);

  const openCreate = () => {
    setEditing(null);
    form.setFieldsValue({ is_active: true, code: '', name: '' });
    setOpen(true);
  };

  const openEdit = (department: Department) => {
    setEditing(department);
    form.setFieldsValue({
      code: department.code ?? '',
      name: department.name,
      head_employee_id: department.head_employee_id,
      parent_department_id: department.parent_department_id,
      description: department.description,
      is_active: department.is_active,
    });
    setOpen(true);
  };

  const submit = async (values: HrDepartmentInput) => {
    setSaving(true);
    try {
      if (editing) await updateHrDepartment(editing.id, values);
      else await createHrDepartment(values);
      message.success(editing ? 'Departemen berhasil diperbarui.' : 'Departemen berhasil ditambahkan.');
      setOpen(false);
      setEditing(null);
      form.resetFields();
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Departemen gagal disimpan.');
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (department: Department) => {
    try {
      await updateHrDepartment(department.id, {
        code: department.code ?? '',
        name: department.name,
        head_employee_id: department.head_employee_id,
        parent_department_id: department.parent_department_id,
        description: department.description,
        is_active: !department.is_active,
      });
      message.success(department.is_active ? 'Departemen dinonaktifkan.' : 'Departemen diaktifkan.');
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Status departemen gagal diubah.');
    }
  };

  const columns: ColumnsType<Department> = [
    {
      title: 'Kode',
      dataIndex: 'code',
      sorter: (left, right) => (left.code ?? '').localeCompare(right.code ?? ''),
      render: (value?: string) => <Text code>{value ?? '-'}</Text>,
    },
    {
      title: 'Departemen',
      dataIndex: 'name',
      sorter: (left, right) => left.name.localeCompare(right.name),
      render: (name: string, department) => (
        <span style={{ paddingLeft: (depthMap.get(department.id) ?? 0) * 20 }}>
          {(depthMap.get(department.id) ?? 0) > 0 ? '↳ ' : ''}{name}
        </span>
      ),
    },
    {
      title: 'Kepala departemen',
      dataIndex: 'head_employee_name',
      sorter: (left, right) => (left.head_employee_name ?? '').localeCompare(right.head_employee_name ?? ''),
      render: (value?: string) => value ?? '-',
    },
    {
      title: 'Parent',
      dataIndex: 'parent_department_name',
      sorter: (left, right) => (left.parent_department_name ?? '').localeCompare(right.parent_department_name ?? ''),
      render: (value?: string) => value ?? '-',
    },
    {
      title: 'Status',
      dataIndex: 'is_active',
      sorter: (left, right) => Number(right.is_active) - Number(left.is_active),
      render: (value: boolean) => <Tag color={value ? 'green' : 'default'}>{value ? 'Aktif' : 'Nonaktif'}</Tag>,
    },
    {
      title: 'Aksi',
      fixed: 'right',
      render: (_value, department) => (
        <Space wrap>
          <Button type="text" icon={<Eye size={16} />} onClick={() => setDetail(department)}>Lihat</Button>
          <Button type="text" icon={<Pencil size={16} />} onClick={() => openEdit(department)}>Edit</Button>
          <Popconfirm
            title={department.is_active ? 'Nonaktifkan departemen?' : 'Aktifkan departemen?'}
            description={department.is_active ? 'Data baru tidak dapat memakai departemen ini.' : undefined}
            okText={department.is_active ? 'Nonaktifkan' : 'Aktifkan'}
            cancelText="Batal"
            onConfirm={() => toggleStatus(department)}
          >
            <Button danger={department.is_active} type="text" icon={department.is_active ? <Power size={16} /> : <RotateCcw size={16} />}>
              {department.is_active ? 'Nonaktifkan' : 'Aktifkan'}
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  if (!result) return <Loading label="Memuat departemen..." />;
  if ('error' in result) return <ErrorState message={result.error} />;

  return (
    <OrganizationPage
      title="Departemen"
      subtitle="Kelola struktur departemen bertingkat, parent, dan kepala departemen."
      action={<Button type="primary" icon={<Plus size={16} />} onClick={openCreate}>Tambah departemen</Button>}
      filters={(
        <>
          <Input.Search allowClear placeholder="Cari kode, nama, kepala, parent..." value={search} onChange={(event) => setSearch(event.target.value)} />
          <Select
            value={status}
            onChange={setStatus}
            options={[
              { value: 'ALL', label: 'Semua status' },
              { value: 'ACTIVE', label: 'Aktif' },
              { value: 'INACTIVE', label: 'Nonaktif' },
            ]}
          />
        </>
      )}
      table={(
        <Table
          rowKey="id"
          columns={columns}
          dataSource={filtered}
          scroll={{ x: 880 }}
          onChange={(pagination: TablePaginationConfig) => {
            setPage(pagination.current ?? 1);
            setPageSize(pagination.pageSize ?? 10);
          }}
          pagination={{ current: page, pageSize, showSizeChanger: true, total: filtered.length }}
          locale={{ emptyText: <Empty description="Belum ada departemen yang sesuai filter." /> }}
        />
      )}
    >
      <Modal
        title={editing ? 'Edit departemen' : 'Tambah departemen'}
        open={open}
        onCancel={() => { setOpen(false); setEditing(null); form.resetFields(); }}
        onOk={() => form.submit()}
        confirmLoading={saving}
        okText="Simpan"
        cancelText="Batal"
        destroyOnHidden
      >
        <Form form={form} layout="vertical" onFinish={submit}>
          <Form.Item name="code" label="Kode departemen" rules={[{ required: true, message: 'Kode wajib diisi.' }]}>
            <Input maxLength={20} />
          </Form.Item>
          <Form.Item name="name" label="Nama departemen" rules={[{ required: true, message: 'Nama wajib diisi.' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="head_employee_id" label="Kepala departemen">
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              options={activeEmployees.map((employee) => ({
                value: employee.id,
                label: `${employee.employee_number ?? '-'} - ${employee.name}`,
              }))}
            />
          </Form.Item>
          <Form.Item name="parent_department_id" label="Parent department">
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              options={activeDepartments.filter((department) => department.id !== editing?.id).map((department) => ({
                value: department.id,
                label: `${department.code ?? '-'} - ${department.name}`,
              }))}
            />
          </Form.Item>
          <Form.Item name="description" label="Deskripsi"><Input.TextArea rows={3} /></Form.Item>
          <Form.Item name="is_active" label="Status aktif" valuePropName="checked"><Switch /></Form.Item>
        </Form>
      </Modal>
      <Drawer
        title={detail ? `${detail.code ?? '-'} - ${detail.name}` : 'Detail departemen'}
        open={Boolean(detail)}
        width={560}
        onClose={() => setDetail(null)}
      >
        {detail && (
          <Descriptions bordered column={1}>
            <Descriptions.Item label="Kode">{detail.code ?? '-'}</Descriptions.Item>
            <Descriptions.Item label="Nama">{detail.name}</Descriptions.Item>
            <Descriptions.Item label="Kepala departemen">{detail.head_employee_name ?? '-'}</Descriptions.Item>
            <Descriptions.Item label="Parent department">{detail.parent_department_name ?? '-'}</Descriptions.Item>
            <Descriptions.Item label="Deskripsi">{detail.description ?? '-'}</Descriptions.Item>
            <Descriptions.Item label="Status">
              <Tag color={detail.is_active ? 'green' : 'default'}>{detail.is_active ? 'Aktif' : 'Nonaktif'}</Tag>
            </Descriptions.Item>
          </Descriptions>
        )}
      </Drawer>
    </OrganizationPage>
  );
}

export function HrPositionManagement() {
  const { message } = App.useApp();
  const [form] = Form.useForm<HrPositionInput>();
  const result = useOrganizationData();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('ALL');
  const [departmentId, setDepartmentId] = useState<string | 'ALL'>('ALL');
  const [editing, setEditing] = useState<HrPosition | null>(null);
  const [detail, setDetail] = useState<HrPosition | null>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const data: OrganizationResult = result?.data ?? { departments: [], positions: [], employees: [] };
  const activeDepartments = data.departments.filter((department) => department.is_active);
  const activePositions = data.positions.filter((position) => position.is_active);
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return data.positions.filter((position) => (
      (!query || [position.code, position.name, position.level, position.department_name]
        .some((value) => value?.toLowerCase().includes(query))) &&
      (status === 'ALL' || position.is_active === (status === 'ACTIVE')) &&
      (departmentId === 'ALL' || position.department_id === departmentId)
    ));
  }, [data.positions, departmentId, search, status]);

  useEffect(() => setPage(1), [search, status, departmentId]);

  const openCreate = () => {
    setEditing(null);
    form.setFieldsValue({ is_active: true, code: '', name: '', level: '', department_id: '' });
    setOpen(true);
  };
  const openEdit = (position: HrPosition) => {
    setEditing(position);
    form.setFieldsValue({
      code: position.code,
      name: position.name,
      department_id: position.department_id,
      level: position.level,
      reports_to_position_id: position.reports_to_position_id,
      description: position.description,
      is_active: position.is_active,
    });
    setOpen(true);
  };
  const submit = async (values: HrPositionInput) => {
    setSaving(true);
    try {
      if (editing) await updateHrPosition(editing.id, values);
      else await createHrPosition(values);
      message.success(editing ? 'Jabatan berhasil diperbarui.' : 'Jabatan berhasil ditambahkan.');
      setOpen(false);
      setEditing(null);
      form.resetFields();
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Jabatan gagal disimpan.');
    } finally {
      setSaving(false);
    }
  };
  const toggleStatus = async (position: HrPosition) => {
    try {
      await updateHrPosition(position.id, {
        code: position.code,
        name: position.name,
        department_id: position.department_id,
        level: position.level,
        reports_to_position_id: position.reports_to_position_id,
        description: position.description,
        is_active: !position.is_active,
      });
      message.success(position.is_active ? 'Jabatan dinonaktifkan.' : 'Jabatan diaktifkan.');
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Status jabatan gagal diubah.');
    }
  };

  const columns: ColumnsType<HrPosition> = [
    { title: 'Kode', dataIndex: 'code', sorter: (left, right) => left.code.localeCompare(right.code), render: (value: string) => <Text code>{value}</Text> },
    { title: 'Nama jabatan', dataIndex: 'name', sorter: (left, right) => left.name.localeCompare(right.name) },
    { title: 'Departemen', dataIndex: 'department_name', sorter: (left, right) => (left.department_name ?? '').localeCompare(right.department_name ?? '') },
    { title: 'Level', dataIndex: 'level', sorter: (left, right) => left.level.localeCompare(right.level) },
    { title: 'Atasan jabatan', dataIndex: 'reports_to_position_name', render: (value?: string) => value ?? '-' },
    { title: 'Status', dataIndex: 'is_active', sorter: (left, right) => Number(right.is_active) - Number(left.is_active), render: (value: boolean) => <Tag color={value ? 'green' : 'default'}>{value ? 'Aktif' : 'Nonaktif'}</Tag> },
    {
      title: 'Aksi',
      fixed: 'right',
      render: (_value, position) => (
        <Space wrap>
          <Button type="text" icon={<Eye size={16} />} onClick={() => setDetail(position)}>Lihat</Button>
          <Button type="text" icon={<Pencil size={16} />} onClick={() => openEdit(position)}>Edit</Button>
          <Popconfirm
            title={position.is_active ? 'Nonaktifkan jabatan?' : 'Aktifkan jabatan?'}
            description={position.is_active ? 'Jabatan tidak dapat dipakai pada data baru.' : undefined}
            okText={position.is_active ? 'Nonaktifkan' : 'Aktifkan'}
            cancelText="Batal"
            onConfirm={() => toggleStatus(position)}
          >
            <Button danger={position.is_active} type="text" icon={position.is_active ? <Power size={16} /> : <RotateCcw size={16} />}>
              {position.is_active ? 'Nonaktifkan' : 'Aktifkan'}
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  if (!result) return <Loading label="Memuat jabatan..." />;
  if ('error' in result) return <ErrorState message={result.error} />;

  return (
    <OrganizationPage
      title="Jabatan"
      subtitle="Kelola master jabatan, level, departemen, dan garis pelaporan."
      action={<Button type="primary" icon={<Plus size={16} />} onClick={openCreate}>Tambah jabatan</Button>}
      filters={(
        <>
          <Input.Search allowClear placeholder="Cari kode, nama, level..." value={search} onChange={(event) => setSearch(event.target.value)} />
          <Select
            value={departmentId}
            onChange={setDepartmentId}
            options={[
              { value: 'ALL', label: 'Semua departemen' },
              ...data.departments.map((department) => ({ value: department.id, label: department.name })),
            ]}
          />
          <Select
            value={status}
            onChange={setStatus}
            options={[
              { value: 'ALL', label: 'Semua status' },
              { value: 'ACTIVE', label: 'Aktif' },
              { value: 'INACTIVE', label: 'Nonaktif' },
            ]}
          />
        </>
      )}
      table={(
        <Table
          rowKey="id"
          columns={columns}
          dataSource={filtered}
          scroll={{ x: 980 }}
          onChange={(pagination: TablePaginationConfig) => {
            setPage(pagination.current ?? 1);
            setPageSize(pagination.pageSize ?? 10);
          }}
          pagination={{ current: page, pageSize, showSizeChanger: true, total: filtered.length }}
          locale={{ emptyText: <Empty description="Belum ada jabatan yang sesuai filter." /> }}
        />
      )}
    >
      <Modal
        title={editing ? 'Edit jabatan' : 'Tambah jabatan'}
        open={open}
        onCancel={() => { setOpen(false); setEditing(null); form.resetFields(); }}
        onOk={() => form.submit()}
        confirmLoading={saving}
        okText="Simpan"
        cancelText="Batal"
        destroyOnHidden
      >
        <Form form={form} layout="vertical" onFinish={submit}>
          <Form.Item name="code" label="Kode jabatan" rules={[{ required: true, message: 'Kode wajib diisi.' }]}><Input maxLength={20} /></Form.Item>
          <Form.Item name="name" label="Nama jabatan" rules={[{ required: true, message: 'Nama wajib diisi.' }]}><Input /></Form.Item>
          <Form.Item name="department_id" label="Departemen" rules={[{ required: true, message: 'Departemen wajib dipilih.' }]}>
            <Select showSearch optionFilterProp="label" options={activeDepartments.map((department) => ({ value: department.id, label: `${department.code ?? '-'} - ${department.name}` }))} />
          </Form.Item>
          <Form.Item name="level" label="Level jabatan" rules={[{ required: true, message: 'Level wajib diisi.' }]}><Input placeholder="Staf, Supervisor, Manager, ..." /></Form.Item>
          <Form.Item name="reports_to_position_id" label="Atasan jabatan">
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              options={activePositions.filter((position) => position.id !== editing?.id).map((position) => ({
                value: position.id,
                label: `${position.code} - ${position.name}`,
              }))}
            />
          </Form.Item>
          <Form.Item name="description" label="Deskripsi"><Input.TextArea rows={3} /></Form.Item>
          <Form.Item name="is_active" label="Status aktif" valuePropName="checked"><Switch /></Form.Item>
        </Form>
      </Modal>
      <Drawer
        title={detail ? `${detail.code} - ${detail.name}` : 'Detail jabatan'}
        open={Boolean(detail)}
        width={560}
        onClose={() => setDetail(null)}
      >
        {detail && (
          <Descriptions bordered column={1}>
            <Descriptions.Item label="Kode">{detail.code}</Descriptions.Item>
            <Descriptions.Item label="Nama jabatan">{detail.name}</Descriptions.Item>
            <Descriptions.Item label="Departemen">{detail.department_name ?? '-'}</Descriptions.Item>
            <Descriptions.Item label="Level">{detail.level}</Descriptions.Item>
            <Descriptions.Item label="Atasan jabatan">{detail.reports_to_position_name ?? '-'}</Descriptions.Item>
            <Descriptions.Item label="Deskripsi">{detail.description ?? '-'}</Descriptions.Item>
            <Descriptions.Item label="Status">
              <Tag color={detail.is_active ? 'green' : 'default'}>{detail.is_active ? 'Aktif' : 'Nonaktif'}</Tag>
            </Descriptions.Item>
          </Descriptions>
        )}
      </Drawer>
    </OrganizationPage>
  );
}

function OrganizationPage(props: {
  title: string;
  subtitle: string;
  action: React.ReactNode;
  filters: React.ReactNode;
  table: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-5 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <Title level={2} className="!mb-1">{props.title}</Title>
          <Text type="secondary">{props.subtitle}</Text>
        </div>
        {props.action}
      </div>
      <Card>
        <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">{props.filters}</div>
        {props.table}
      </Card>
      {props.children}
    </div>
  );
}

function Loading({ label }: { label: string }) {
  return <div className="flex min-h-[360px] items-center justify-center"><Spin tip={label} /></div>;
}

function ErrorState({ message }: { message: string | undefined }) {
  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <Alert type="error" showIcon message="Struktur organisasi gagal dimuat" description={message} />
    </div>
  );
}
