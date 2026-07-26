import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  App,
  Button,
  Card,
  Col,
  DatePicker,
  Descriptions,
  Drawer,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table';
import type { Dayjs } from 'dayjs';
import { useLiveQuery } from 'dexie-react-hooks';
import { Eye, FilePlus2, Pencil, PlayCircle, Power, RefreshCw } from 'lucide-react';
import { useAuth } from '@/auth/useAuth';
import { db } from '@/lib/db';
import dayjs from '@/lib/dayjs';
import type { EmploymentContractInput } from '@/lib/validations/hr';
import {
  createEmploymentContract,
  renewEmploymentContract,
  setEmploymentContractStatus,
  updateDraftEmploymentContract,
} from '@/services/hrService';
import type {
  Department,
  Employee,
  EmploymentContract,
  EmploymentContractStatus,
  EmploymentContractType,
  HrPosition,
} from '@/types';

const { Title, Text } = Typography;

const TYPE_LABEL: Record<EmploymentContractType, string> = {
  PROBATION: 'Probation',
  FIXED_TERM: 'Kontrak waktu tertentu',
  PERMANENT: 'Tetap',
  INTERNSHIP: 'Magang',
  FREELANCE: 'Freelance',
};

const STATUS_LABEL: Record<EmploymentContractStatus, string> = {
  DRAFT: 'Draft',
  ACTIVE: 'Aktif',
  EXPIRED: 'Berakhir',
  RENEWED: 'Diperpanjang',
  TERMINATED: 'Dihentikan',
};

const STATUS_COLOR: Record<EmploymentContractStatus, string> = {
  DRAFT: 'default',
  ACTIVE: 'green',
  EXPIRED: 'red',
  RENEWED: 'blue',
  TERMINATED: 'orange',
};

type StatusFilter = EmploymentContractStatus | 'ALL';
type TypeFilter = EmploymentContractType | 'ALL';

type ContractFormValues = Omit<EmploymentContractInput, 'start_date' | 'end_date'> & {
  start_date?: Dayjs;
  end_date?: Dayjs;
};

export default function HrContractManagement() {
  const { message } = App.useApp();
  const { can } = useAuth();
  const [form] = Form.useForm<ContractFormValues>();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('ALL');
  const [departmentId, setDepartmentId] = useState<string | 'ALL'>('ALL');
  const [type, setType] = useState<TypeFilter>('ALL');
  const [editing, setEditing] = useState<EmploymentContract | null>(null);
  const [renewing, setRenewing] = useState<EmploymentContract | null>(null);
  const [detail, setDetail] = useState<EmploymentContract | null>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const canViewPayroll = can('hr.payroll.view');
  const canManagePayroll = can('hr.payroll.manage');

  const result = useLiveQuery(async () => {
    try {
      const [contracts, employees, departments, positions] = await Promise.all([
        db.employmentContracts.orderBy('start_date').reverse().toArray(),
        db.employees.orderBy('name').toArray(),
        db.departments.orderBy('name').toArray(),
        db.hrPositions.orderBy('name').toArray(),
      ]);
      return { data: { contracts, employees, departments, positions } };
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Data kontrak gagal dimuat.' };
    }
  }, []);

  const data: {
    contracts: EmploymentContract[];
    employees: Employee[];
    departments: Department[];
    positions: HrPosition[];
  } = result?.data ?? { contracts: [], employees: [], departments: [], positions: [] };

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return data.contracts.filter((contract) => (
      (!query || [contract.contract_number, contract.employee_number, contract.employee_name, contract.job_position_name]
        .some((value) => value?.toLowerCase().includes(query))) &&
      (status === 'ALL' || contract.status === status) &&
      (departmentId === 'ALL' || contract.department_id === departmentId) &&
      (type === 'ALL' || contract.contract_type === type)
    ));
  }, [data.contracts, departmentId, search, status, type]);

  useEffect(() => setPage(1), [search, status, departmentId, type]);

  const selectedDepartmentId = Form.useWatch('department_id', form);
  const activeDepartments = data.departments.filter((department) => department.is_active);
  const activePositions = data.positions.filter((position) => (
    position.is_active && (!selectedDepartmentId || position.department_id === selectedDepartmentId)
  ));
  const selectableEmployees = data.employees.filter((employee) => employee.active_status !== 'TERMINATED');

  const closeForm = () => {
    setOpen(false);
    setEditing(null);
    setRenewing(null);
    form.resetFields();
  };
  const openCreate = () => {
    setEditing(null);
    setRenewing(null);
    form.setFieldsValue({
      contract_number: '',
      contract_type: 'FIXED_TERM',
      status: 'DRAFT',
      base_salary: 0,
    });
    setOpen(true);
  };
  const openEdit = (contract: EmploymentContract) => {
    setEditing(contract);
    setRenewing(null);
    form.setFieldsValue({
      ...contract,
      start_date: dayjs(contract.start_date),
      end_date: contract.end_date ? dayjs(contract.end_date) : undefined,
    });
    setOpen(true);
  };
  const openRenew = (contract: EmploymentContract) => {
    setEditing(null);
    setRenewing(contract);
    const suffix = data.contracts.filter((item) => item.renewed_from_contract_id === contract.id).length + 1;
    form.setFieldsValue({
      contract_number: `${contract.contract_number}-R${suffix}`,
      employee_id: contract.employee_id,
      contract_type: contract.contract_type,
      start_date: contract.end_date ? dayjs(contract.end_date).add(1, 'day') : dayjs(),
      job_position_id: contract.job_position_id,
      department_id: contract.department_id,
      base_salary: contract.base_salary,
      status: 'ACTIVE',
      renewed_from_contract_id: contract.id,
    });
    setOpen(true);
  };
  const submit = async (values: ContractFormValues) => {
    setSaving(true);
    try {
      const input: EmploymentContractInput = {
        ...values,
        start_date: values.start_date?.format('YYYY-MM-DD') ?? '',
        end_date: values.end_date?.format('YYYY-MM-DD'),
        base_salary: canManagePayroll
          ? values.base_salary
          : editing?.base_salary ?? renewing?.base_salary ?? 0,
      };
      if (renewing) await renewEmploymentContract(renewing.id, input);
      else if (editing) await updateDraftEmploymentContract(editing.id, input);
      else await createEmploymentContract(input);
      message.success(renewing ? 'Kontrak berhasil diperpanjang sebagai record baru.' : editing ? 'Draft kontrak diperbarui.' : 'Kontrak berhasil dibuat.');
      closeForm();
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Kontrak gagal disimpan.');
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (
    contract: EmploymentContract,
    status: Extract<EmploymentContractStatus, 'ACTIVE' | 'TERMINATED'>,
  ) => {
    try {
      await setEmploymentContractStatus(contract.id, status);
      message.success(status === 'ACTIVE' ? 'Kontrak berhasil diaktifkan.' : 'Kontrak berhasil dihentikan.');
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Status kontrak gagal diubah.');
    }
  };

  const columns: ColumnsType<EmploymentContract> = [
    { title: 'Nomor kontrak', dataIndex: 'contract_number', sorter: (left, right) => left.contract_number.localeCompare(right.contract_number), render: (value: string) => <Text code>{value}</Text> },
    {
      title: 'Karyawan',
      dataIndex: 'employee_name',
      sorter: (left, right) => left.employee_name.localeCompare(right.employee_name),
      render: (name: string, contract) => <div><Text strong>{name}</Text><div><Text type="secondary">{contract.employee_number ?? '-'}</Text></div></div>,
    },
    { title: 'Jenis', dataIndex: 'contract_type', sorter: (left, right) => left.contract_type.localeCompare(right.contract_type), render: (value: EmploymentContractType) => TYPE_LABEL[value] },
    { title: 'Departemen', dataIndex: 'department_name', sorter: (left, right) => left.department_name.localeCompare(right.department_name) },
    { title: 'Jabatan', dataIndex: 'job_position_name', sorter: (left, right) => left.job_position_name.localeCompare(right.job_position_name) },
    {
      title: 'Periode',
      sorter: (left, right) => left.start_date.localeCompare(right.start_date),
      render: (_value, contract) => `${dayjs(contract.start_date).format('DD MMM YYYY')} – ${contract.end_date ? dayjs(contract.end_date).format('DD MMM YYYY') : 'Tidak terbatas'}`,
    },
    { title: 'Status', dataIndex: 'status', sorter: (left, right) => left.status.localeCompare(right.status), render: (value: EmploymentContractStatus) => <Tag color={STATUS_COLOR[value]}>{STATUS_LABEL[value]}</Tag> },
    {
      title: 'Aksi',
      fixed: 'right',
      width: 270,
      render: (_value, contract) => (
        <Space wrap>
          <Button type="text" icon={<Eye size={16} />} onClick={() => setDetail(contract)}>Lihat</Button>
          {contract.status === 'DRAFT' && <Button type="text" icon={<Pencil size={16} />} onClick={() => openEdit(contract)}>Edit draft</Button>}
          {contract.status === 'DRAFT' && (
            <Popconfirm
              title="Aktifkan kontrak ini?"
              description="Isi kontrak akan dikunci setelah diaktifkan."
              okText="Aktifkan"
              cancelText="Batal"
              onConfirm={() => changeStatus(contract, 'ACTIVE')}
            >
              <Button type="text" icon={<PlayCircle size={16} />}>Aktifkan</Button>
            </Popconfirm>
          )}
          {contract.status === 'ACTIVE' && (
            <Popconfirm
              title="Hentikan kontrak ini?"
              description="Riwayat kontrak tetap disimpan dan tidak dihapus."
              okText="Hentikan"
              cancelText="Batal"
              onConfirm={() => changeStatus(contract, 'TERMINATED')}
            >
              <Button danger type="text" icon={<Power size={16} />}>Hentikan</Button>
            </Popconfirm>
          )}
          {contract.status !== 'DRAFT' && contract.status !== 'TERMINATED' && (
            <Button type="text" icon={<RefreshCw size={16} />} onClick={() => openRenew(contract)}>Perpanjang</Button>
          )}
        </Space>
      ),
    },
  ];

  if (!result) return <div className="flex min-h-[360px] items-center justify-center"><Spin tip="Memuat kontrak..." /></div>;
  if ('error' in result) return <div className="p-4 sm:p-6 lg:p-8"><Alert type="error" showIcon message="Data kontrak gagal dimuat" description={result.error} /></div>;

  return (
    <div className="space-y-5 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <Title level={2} className="!mb-1">Kontrak Kerja</Title>
          <Text type="secondary">Riwayat kontrak dipertahankan; perpanjangan selalu membuat record baru.</Text>
        </div>
        <Button type="primary" icon={<FilePlus2 size={16} />} onClick={openCreate}>Buat kontrak</Button>
      </div>
      <Card>
        <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Input.Search allowClear placeholder="Cari kontrak atau karyawan..." value={search} onChange={(event) => setSearch(event.target.value)} />
          <Select value={status} onChange={setStatus} options={[{ value: 'ALL', label: 'Semua status' }, ...Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label }))]} />
          <Select value={departmentId} onChange={setDepartmentId} options={[{ value: 'ALL', label: 'Semua departemen' }, ...data.departments.map((department) => ({ value: department.id, label: department.name }))]} />
          <Select value={type} onChange={setType} options={[{ value: 'ALL', label: 'Semua jenis kontrak' }, ...Object.entries(TYPE_LABEL).map(([value, label]) => ({ value, label }))]} />
        </div>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={filtered}
          scroll={{ x: 1280 }}
          onChange={(pagination: TablePaginationConfig) => {
            setPage(pagination.current ?? 1);
            setPageSize(pagination.pageSize ?? 10);
          }}
          pagination={{ current: page, pageSize, total: filtered.length, showSizeChanger: true, showTotal: (total) => `${total} kontrak` }}
          locale={{ emptyText: <Empty description="Belum ada kontrak yang sesuai filter." /> }}
        />
      </Card>

      <Modal
        title={renewing ? `Perpanjang ${renewing.contract_number}` : editing ? `Edit draft ${editing.contract_number}` : 'Buat kontrak'}
        open={open}
        onCancel={closeForm}
        onOk={() => form.submit()}
        confirmLoading={saving}
        okText={renewing ? 'Buat perpanjangan' : 'Simpan'}
        cancelText="Batal"
        width={760}
        destroyOnHidden
      >
        {renewing && <Alert className="mb-4" type="info" showIcon message="Kontrak lama tidak akan ditimpa. Sistem akan menandainya sebagai Diperpanjang dan membuat record baru." />}
        <Form form={form} layout="vertical" onFinish={submit}>
          <Row gutter={16}>
            <Col xs={24} md={12}><Form.Item name="contract_number" label="Nomor kontrak" rules={[{ required: true, message: 'Nomor kontrak wajib diisi.' }]}><Input /></Form.Item></Col>
            <Col xs={24} md={12}>
              <Form.Item name="employee_id" label="Karyawan" rules={[{ required: true, message: 'Karyawan wajib dipilih.' }]}>
                <Select
                  disabled={Boolean(renewing)}
                  showSearch
                  optionFilterProp="label"
                  options={selectableEmployees.map((employee) => ({ value: employee.id, label: `${employee.employee_number ?? '-'} - ${employee.name}` }))}
                  onChange={(employeeId) => {
                    const employee = data.employees.find((item) => item.id === employeeId);
                    if (employee) {
                      form.setFieldsValue({
                        department_id: employee.department_id,
                        job_position_id: employee.job_position_id,
                        base_salary: employee.base_salary ?? 0,
                      });
                    }
                  }}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="contract_type" label="Jenis kontrak" rules={[{ required: true }]}>
                <Select options={Object.entries(TYPE_LABEL).map(([value, label]) => ({ value, label }))} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="status" label="Status kontrak" rules={[{ required: true }]}>
                <Select
                  disabled={Boolean(editing || renewing)}
                  options={[
                    { value: 'DRAFT', label: STATUS_LABEL.DRAFT },
                    { value: 'ACTIVE', label: STATUS_LABEL.ACTIVE },
                  ]}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}><Form.Item name="start_date" label="Tanggal mulai" rules={[{ required: true, message: 'Tanggal mulai wajib diisi.' }]}><DatePicker className="w-full" /></Form.Item></Col>
            <Col xs={24} md={12}><Form.Item name="end_date" label="Tanggal berakhir"><DatePicker className="w-full" /></Form.Item></Col>
            <Col xs={24} md={12}>
              <Form.Item name="department_id" label="Departemen" rules={[{ required: true, message: 'Departemen wajib dipilih.' }]}>
                <Select
                  showSearch
                  optionFilterProp="label"
                  options={activeDepartments.map((department) => ({ value: department.id, label: department.name }))}
                  onChange={() => form.setFieldValue('job_position_id', undefined)}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="job_position_id" label="Jabatan" rules={[{ required: true, message: 'Jabatan wajib dipilih.' }]}>
                <Select showSearch optionFilterProp="label" options={activePositions.map((position) => ({ value: position.id, label: `${position.code} - ${position.name}` }))} />
              </Form.Item>
            </Col>
            {canViewPayroll && (
              <Col xs={24} md={12}>
                <Form.Item name="base_salary" label="Gaji pokok" rules={[{ required: true, message: 'Gaji pokok wajib diisi.' }]}>
                  <InputNumber disabled={!canManagePayroll} min={0} controls={false} prefix="Rp" className="w-full" />
                </Form.Item>
              </Col>
            )}
            <Col span={24}><Form.Item name="notes" label="Catatan"><Input.TextArea rows={3} /></Form.Item></Col>
          </Row>
        </Form>
      </Modal>

      <Drawer title={detail ? `Kontrak ${detail.contract_number}` : 'Detail kontrak'} open={Boolean(detail)} width={680} onClose={() => setDetail(null)}>
        {detail && (
          <>
            <Descriptions bordered column={{ xs: 1, sm: 2 }}>
              <Descriptions.Item label="Karyawan">{detail.employee_name}</Descriptions.Item>
              <Descriptions.Item label="Nomor karyawan">{detail.employee_number ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="Jenis">{TYPE_LABEL[detail.contract_type]}</Descriptions.Item>
              <Descriptions.Item label="Status"><Tag color={STATUS_COLOR[detail.status]}>{STATUS_LABEL[detail.status]}</Tag></Descriptions.Item>
              <Descriptions.Item label="Mulai">{dayjs(detail.start_date).format('DD MMM YYYY')}</Descriptions.Item>
              <Descriptions.Item label="Berakhir">{detail.end_date ? dayjs(detail.end_date).format('DD MMM YYYY') : 'Tidak terbatas'}</Descriptions.Item>
              <Descriptions.Item label="Departemen">{detail.department_name}</Descriptions.Item>
              <Descriptions.Item label="Jabatan">{detail.job_position_name}</Descriptions.Item>
              {canViewPayroll && <Descriptions.Item label="Gaji pokok" span={2}>{new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(detail.base_salary)}</Descriptions.Item>}
              <Descriptions.Item label="Catatan" span={2}>{detail.notes ?? '-'}</Descriptions.Item>
            </Descriptions>
            {detail.renewed_from_contract_id && (
              <Alert className="mt-4" type="info" showIcon message="Kontrak ini merupakan perpanjangan dari kontrak sebelumnya." />
            )}
            {!canViewPayroll && (
              <Alert className="mt-4" type="warning" showIcon message="Gaji pokok disembunyikan karena Anda tidak memiliki hr.payroll.view." />
            )}
          </>
        )}
      </Drawer>
    </div>
  );
}
