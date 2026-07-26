import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  App,
  Avatar,
  Button,
  Card,
  Col,
  DatePicker,
  Descriptions,
  Divider,
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
  Tabs,
  Tag,
  Typography,
  Upload,
} from 'antd';
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table';
import type { UploadProps } from 'antd';
import type { Dayjs } from 'dayjs';
import { useLiveQuery } from 'dexie-react-hooks';
import { Eye, Pencil, Plus, Power, RotateCcw, UploadCloud, UserRound } from 'lucide-react';
import { useAuth } from '@/auth/useAuth';
import { db } from '@/lib/db';
import dayjs from '@/lib/dayjs';
import type { HrEmployeeInput } from '@/lib/validations/hr';
import {
  createHrEmployee,
  setHrEmployeeActiveStatus,
  updateHrEmployee,
  upsertEmployeeSalaryComponent,
} from '@/services/hrService';
import type {
  Department,
  Employee,
  EmployeeActiveStatus,
  EmployeeEmploymentStatus,
  EmployeeSalaryComponent,
  HrPosition,
  SalaryComponent,
} from '@/types';

const { Title, Text, Paragraph } = Typography;

const EMPLOYMENT_STATUS_LABEL: Record<EmployeeEmploymentStatus, string> = {
  PROBATION: 'Probation',
  CONTRACT: 'Kontrak',
  PERMANENT: 'Tetap',
  INTERN: 'Magang',
  FREELANCE: 'Freelance',
};

const ACTIVE_STATUS_LABEL: Record<EmployeeActiveStatus, string> = {
  ACTIVE: 'Aktif',
  LONG_LEAVE: 'Cuti panjang',
  INACTIVE: 'Nonaktif',
  RESIGNED: 'Resign',
  TERMINATED: 'Diberhentikan',
};

const ACTIVE_STATUS_COLOR: Record<EmployeeActiveStatus, string> = {
  ACTIVE: 'green',
  LONG_LEAVE: 'gold',
  INACTIVE: 'default',
  RESIGNED: 'blue',
  TERMINATED: 'red',
};

type EmployeeDateField =
  | 'birth_date'
  | 'join_date'
  | 'contract_start_date'
  | 'contract_end_date'
  | 'permanent_date'
  | 'exit_date';

interface SalaryAssignmentValue {
  salary_component_id: string;
  value: number;
}

type EmployeeFormValues = Omit<HrEmployeeInput, EmployeeDateField> & {
  birth_date?: Dayjs;
  join_date?: Dayjs;
  contract_start_date?: Dayjs;
  contract_end_date?: Dayjs;
  permanent_date?: Dayjs;
  exit_date?: Dayjs;
  salary_components?: SalaryAssignmentValue[];
};

interface EmployeeDataResult {
  employees: Employee[];
  departments: Department[];
  positions: HrPosition[];
  salaryComponents: SalaryComponent[];
  assignments: EmployeeSalaryComponent[];
}

const toDateValue = (value: string | undefined) => value ? dayjs(value) : undefined;
const toDateString = (value: Dayjs | undefined) => value?.format('YYYY-MM-DD');
const formatMoney = (value: number | undefined, currency = 'IDR') => (
  new Intl.NumberFormat('id-ID', { style: 'currency', currency, maximumFractionDigits: 0 }).format(value ?? 0)
);

const readImage = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result));
  reader.onerror = () => reject(new Error('Foto gagal dibaca.'));
  reader.readAsDataURL(file);
});

export default function HrEmployeeManagement() {
  const { message } = App.useApp();
  const { can } = useAuth();
  const [form] = Form.useForm<EmployeeFormValues>();
  const [search, setSearch] = useState('');
  const [activeStatus, setActiveStatus] = useState<EmployeeActiveStatus | 'ALL'>('ALL');
  const [departmentId, setDepartmentId] = useState<string | 'ALL'>('ALL');
  const [employmentStatus, setEmploymentStatus] = useState<EmployeeEmploymentStatus | 'ALL'>('ALL');
  const [editing, setEditing] = useState<Employee | null>(null);
  const [detail, setDetail] = useState<Employee | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const canCreate = can('hr.employee.create');
  const canUpdate = can('hr.employee.update');
  const canDeactivate = can('hr.employee.deactivate');
  const canViewPayroll = can('hr.payroll.view');
  const canManagePayroll = can('hr.payroll.manage');

  const result = useLiveQuery(async () => {
    try {
      const [employees, departments, positions, salaryComponents, assignments] = await Promise.all([
        db.employees.orderBy('name').toArray(),
        db.departments.orderBy('name').toArray(),
        db.hrPositions.orderBy('name').toArray(),
        db.salaryComponents.orderBy('name').toArray(),
        db.employeeSalaryComponents.toArray(),
      ]);
      return { data: { employees, departments, positions, salaryComponents, assignments } };
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Data karyawan gagal dimuat.' };
    }
  }, []);

  const data: EmployeeDataResult = result?.data ?? {
    employees: [],
    departments: [],
    positions: [],
    salaryComponents: [],
    assignments: [],
  };

  const filteredEmployees = useMemo(() => {
    const query = search.trim().toLowerCase();
    return data.employees.filter((employee) => {
      const resolvedActiveStatus = employee.active_status ?? (employee.is_active ? 'ACTIVE' : 'INACTIVE');
      return (
        (!query || [
          employee.employee_number,
          employee.name,
          employee.preferred_name,
          employee.nik,
          employee.phone,
          employee.personal_email,
          employee.department_name,
          employee.job_position_name,
        ].some((value) => value?.toLowerCase().includes(query))) &&
        (activeStatus === 'ALL' || resolvedActiveStatus === activeStatus) &&
        (departmentId === 'ALL' || employee.department_id === departmentId) &&
        (employmentStatus === 'ALL' || employee.employment_status === employmentStatus)
      );
    });
  }, [activeStatus, data.employees, departmentId, employmentStatus, search]);

  useEffect(() => {
    setPage(1);
  }, [search, activeStatus, departmentId, employmentStatus]);

  const activeDepartments = data.departments.filter((department) => department.is_active);
  const activeEmployees = data.employees.filter((employee) => (
    employee.is_active && (employee.active_status ?? 'ACTIVE') === 'ACTIVE'
  ));
  const selectedDepartmentId = Form.useWatch('department_id', form);
  const selectedPaymentMethod = Form.useWatch('salary_payment_method', form);
  const selectedPhoto = Form.useWatch('photo_data_url', form);
  const availablePositions = data.positions.filter((position) => (
    position.is_active && (!selectedDepartmentId || position.department_id === selectedDepartmentId)
  ));

  const resetAndCloseForm = () => {
    setFormOpen(false);
    setEditing(null);
    form.resetFields();
  };

  const openCreate = () => {
    setEditing(null);
    form.setFieldsValue({
      employment_status: 'PROBATION',
      active_status: 'ACTIVE',
      work_schedule_type: 'FULL_TIME',
      nationality: 'Indonesia',
      salary_currency: 'IDR',
      payroll_period: 'MONTHLY',
      salary_payment_method: canManagePayroll ? 'CASH' : undefined,
      base_salary: 0,
      is_taxable: true,
      is_bpjs_participant: false,
      salary_components: [],
    });
    setFormOpen(true);
  };

  const openEdit = (employee: Employee) => {
    setEditing(employee);
    const assignments = data.assignments
      .filter((assignment) => assignment.employee_id === employee.id && assignment.is_active)
      .map((assignment) => ({
        salary_component_id: assignment.salary_component_id,
        value: assignment.value,
      }));
    form.setFieldsValue({
      ...employee,
      personal_email: employee.personal_email ?? employee.email,
      identity_address: employee.identity_address ?? employee.address,
      domicile_address: employee.domicile_address ?? employee.address,
      employment_status: employee.employment_status ?? 'PERMANENT',
      active_status: employee.active_status ?? (employee.is_active ? 'ACTIVE' : 'INACTIVE'),
      work_schedule_type: employee.work_schedule_type ?? 'FULL_TIME',
      birth_date: toDateValue(employee.birth_date),
      join_date: toDateValue(employee.join_date),
      contract_start_date: toDateValue(employee.contract_start_date),
      contract_end_date: toDateValue(employee.contract_end_date),
      permanent_date: toDateValue(employee.permanent_date),
      exit_date: toDateValue(employee.exit_date),
      salary_components: assignments,
    });
    setFormOpen(true);
  };

  const handleSubmit = async (values: EmployeeFormValues) => {
    setSaving(true);
    try {
      const componentIds = (values.salary_components ?? []).map((assignment) => assignment.salary_component_id);
      if (new Set(componentIds).size !== componentIds.length) {
        throw new Error('Komponen gaji yang sama tidak boleh dipilih lebih dari sekali.');
      }
      const payrollValues = editing && !canManagePayroll ? {
        salary_payment_method: editing.salary_payment_method,
        bank_name: editing.bank_name,
        bank_account_number: editing.bank_account_number,
        bank_account_holder: editing.bank_account_holder,
        base_salary: editing.base_salary,
        salary_currency: editing.salary_currency,
        payroll_period: editing.payroll_period,
        is_taxable: editing.is_taxable,
        ptkp_status: editing.ptkp_status,
        is_bpjs_participant: editing.is_bpjs_participant,
      } : {
        salary_payment_method: values.salary_payment_method,
        bank_name: values.bank_name,
        bank_account_number: values.bank_account_number,
        bank_account_holder: values.bank_account_holder,
        base_salary: values.base_salary,
        salary_currency: values.salary_currency,
        payroll_period: values.payroll_period,
        is_taxable: values.is_taxable,
        ptkp_status: values.ptkp_status,
        is_bpjs_participant: values.is_bpjs_participant,
      };
      const input: HrEmployeeInput = {
        ...values,
        ...payrollValues,
        birth_date: toDateString(values.birth_date),
        join_date: toDateString(values.join_date),
        contract_start_date: toDateString(values.contract_start_date),
        contract_end_date: toDateString(values.contract_end_date),
        permanent_date: toDateString(values.permanent_date),
        exit_date: toDateString(values.exit_date),
      };
      const employee = editing
        ? await updateHrEmployee(editing.id, input)
        : await createHrEmployee(input);

      if (canManagePayroll) {
        const selectedAssignments = values.salary_components ?? [];
        const selectedIds = new Set(selectedAssignments.map((assignment) => assignment.salary_component_id));
        const removedAssignments = data.assignments.filter((assignment) => (
          assignment.employee_id === employee.id &&
          assignment.is_active &&
          !selectedIds.has(assignment.salary_component_id)
        ));
        await Promise.all([
          ...selectedAssignments.map((assignment) => upsertEmployeeSalaryComponent(employee.id, {
            salary_component_id: assignment.salary_component_id,
            value: assignment.value,
            is_active: true,
          })),
          ...removedAssignments.map((assignment) => upsertEmployeeSalaryComponent(employee.id, {
            salary_component_id: assignment.salary_component_id,
            value: assignment.value,
            is_active: false,
          })),
        ]);
      }
      message.success(editing ? 'Data karyawan berhasil diperbarui.' : 'Karyawan berhasil ditambahkan.');
      resetAndCloseForm();
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Data karyawan gagal disimpan.');
    } finally {
      setSaving(false);
    }
  };

  const changeActiveStatus = async (employee: Employee, status: EmployeeActiveStatus) => {
    try {
      await setHrEmployeeActiveStatus(employee.id, status);
      message.success(status === 'ACTIVE' ? 'Karyawan berhasil diaktifkan.' : 'Karyawan berhasil dinonaktifkan.');
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Status karyawan gagal diubah.');
    }
  };

  const uploadProps: UploadProps = {
    accept: 'image/png,image/jpeg,image/webp',
    maxCount: 1,
    showUploadList: false,
    beforeUpload: async (file) => {
      if (file.size > 2 * 1024 * 1024) {
        message.error('Ukuran foto maksimal 2 MB.');
        return Upload.LIST_IGNORE;
      }
      try {
        form.setFieldValue('photo_data_url', await readImage(file));
      } catch (error) {
        message.error(error instanceof Error ? error.message : 'Foto gagal dibaca.');
      }
      return false;
    },
  };

  const columns: ColumnsType<Employee> = [
    {
      title: 'Karyawan',
      dataIndex: 'name',
      sorter: (left, right) => left.name.localeCompare(right.name),
      render: (name: string, employee) => (
        <Space>
          <Avatar src={employee.photo_data_url} icon={<UserRound size={18} />} />
          <div>
            <Text strong>{name}</Text>
            <div><Text type="secondary">{employee.employee_number ?? '-'}</Text></div>
          </div>
        </Space>
      ),
    },
    {
      title: 'Departemen',
      dataIndex: 'department_name',
      filters: activeDepartments.map((department) => ({ text: department.name, value: department.id })),
      onFilter: (value, employee) => employee.department_id === value,
      sorter: (left, right) => (left.department_name ?? '').localeCompare(right.department_name ?? ''),
      render: (value?: string) => value ?? '-',
    },
    {
      title: 'Jabatan',
      dataIndex: 'job_position_name',
      sorter: (left, right) => (left.job_position_name ?? '').localeCompare(right.job_position_name ?? ''),
      render: (value: string | undefined, employee) => value ?? employee.position ?? '-',
    },
    {
      title: 'Kepegawaian',
      dataIndex: 'employment_status',
      sorter: (left, right) => (left.employment_status ?? '').localeCompare(right.employment_status ?? ''),
      render: (value?: EmployeeEmploymentStatus) => value
        ? <Tag color="blue">{EMPLOYMENT_STATUS_LABEL[value]}</Tag>
        : '-',
    },
    {
      title: 'Tanggal bergabung',
      dataIndex: 'join_date',
      sorter: (left, right) => (left.join_date ?? '').localeCompare(right.join_date ?? ''),
      render: (value?: string) => value ? dayjs(value).format('DD MMM YYYY') : '-',
    },
    {
      title: 'Status',
      dataIndex: 'active_status',
      sorter: (left, right) => (
        (left.active_status ?? (left.is_active ? 'ACTIVE' : 'INACTIVE'))
          .localeCompare(right.active_status ?? (right.is_active ? 'ACTIVE' : 'INACTIVE'))
      ),
      render: (value: EmployeeActiveStatus | undefined, employee) => {
        const status = value ?? (employee.is_active ? 'ACTIVE' : 'INACTIVE');
        return <Tag color={ACTIVE_STATUS_COLOR[status]}>{ACTIVE_STATUS_LABEL[status]}</Tag>;
      },
    },
    {
      title: 'Aksi',
      fixed: 'right',
      width: 260,
      render: (_value, employee) => {
        const currentStatus = employee.active_status ?? (employee.is_active ? 'ACTIVE' : 'INACTIVE');
        return (
          <Space wrap>
            <Button type="text" icon={<Eye size={16} />} onClick={() => setDetail(employee)}>Lihat</Button>
            {canUpdate && (
              <Button type="text" icon={<Pencil size={16} />} onClick={() => openEdit(employee)}>Edit</Button>
            )}
            {canDeactivate && (currentStatus === 'ACTIVE' ? (
              <Popconfirm
                title="Nonaktifkan karyawan?"
                description="Karyawan tidak dapat dipilih sebagai atasan baru."
                okText="Nonaktifkan"
                cancelText="Batal"
                onConfirm={() => changeActiveStatus(employee, 'INACTIVE')}
              >
                <Button danger type="text" icon={<Power size={16} />}>Nonaktifkan</Button>
              </Popconfirm>
            ) : (
              <Popconfirm
                title="Aktifkan kembali karyawan?"
                okText="Aktifkan"
                cancelText="Batal"
                onConfirm={() => changeActiveStatus(employee, 'ACTIVE')}
              >
                <Button type="text" icon={<RotateCcw size={16} />}>Aktifkan</Button>
              </Popconfirm>
            ))}
          </Space>
        );
      },
    },
  ];

  const handleTableChange = (pagination: TablePaginationConfig) => {
    setPage(pagination.current ?? 1);
    setPageSize(pagination.pageSize ?? 10);
  };

  if (!result) {
    return <div className="flex min-h-[360px] items-center justify-center"><Spin tip="Memuat karyawan..." /></div>;
  }

  if ('error' in result) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <Alert type="error" showIcon message="Data karyawan gagal dimuat" description={result.error} />
      </div>
    );
  }

  const detailAssignments = detail
    ? data.assignments.filter((assignment) => assignment.employee_id === detail.id && assignment.is_active)
    : [];

  return (
    <div className="space-y-5 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <Title level={2} className="!mb-1">Karyawan</Title>
          <Text type="secondary">Kelola data pribadi, kepegawaian, dan konfigurasi penggajian karyawan.</Text>
        </div>
        {canCreate && <Button type="primary" icon={<Plus size={16} />} onClick={openCreate}>Tambah karyawan</Button>}
      </div>

      <Card>
        <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Input.Search
            allowClear
            placeholder="Cari nomor, nama, NIK, kontak..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <Select
            value={activeStatus}
            onChange={setActiveStatus}
            options={[
              { value: 'ALL', label: 'Semua status aktif' },
              ...Object.entries(ACTIVE_STATUS_LABEL).map(([value, label]) => ({ value, label })),
            ]}
          />
          <Select
            showSearch
            optionFilterProp="label"
            value={departmentId}
            onChange={setDepartmentId}
            options={[
              { value: 'ALL', label: 'Semua departemen' },
              ...data.departments.map((department) => ({ value: department.id, label: department.name })),
            ]}
          />
          <Select
            value={employmentStatus}
            onChange={setEmploymentStatus}
            options={[
              { value: 'ALL', label: 'Semua jenis kepegawaian' },
              ...Object.entries(EMPLOYMENT_STATUS_LABEL).map(([value, label]) => ({ value, label })),
            ]}
          />
        </div>

        <Table
          rowKey="id"
          columns={columns}
          dataSource={filteredEmployees}
          scroll={{ x: 1180 }}
          onChange={handleTableChange}
          pagination={{
            current: page,
            pageSize,
            total: filteredEmployees.length,
            showSizeChanger: true,
            showTotal: (total) => `${total} karyawan`,
          }}
          locale={{ emptyText: <Empty description="Belum ada karyawan yang sesuai filter." /> }}
        />
      </Card>

      <Modal
        title={editing ? `Edit ${editing.employee_number ?? editing.name}` : 'Tambah karyawan'}
        open={formOpen}
        width={980}
        onCancel={resetAndCloseForm}
        okText="Simpan"
        cancelText="Batal"
        confirmLoading={saving}
        onOk={() => form.submit()}
        destroyOnHidden
      >
        <Form<EmployeeFormValues>
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          scrollToFirstError
        >
          <Tabs
            items={[
              {
                key: 'personal',
                label: 'Data pribadi',
                children: (
                  <div className="pt-2">
                    <Row gutter={16}>
                      <Col xs={24} md={8}>
                        <Form.Item name="photo_data_url" label="Foto">
                          <Input type="hidden" />
                        </Form.Item>
                        <div className="-mt-7 mb-6 flex items-center gap-3">
                          <Avatar size={72} src={selectedPhoto} icon={<UserRound />} />
                          <Upload {...uploadProps}>
                            <Button icon={<UploadCloud size={16} />}>Pilih foto</Button>
                          </Upload>
                        </div>
                      </Col>
                      <Col xs={24} md={8}>
                        <Form.Item name="employee_number" label="Nomor karyawan" extra="Kosongkan untuk nomor otomatis.">
                          <Input placeholder="EMP-00001" disabled={Boolean(editing)} />
                        </Form.Item>
                      </Col>
                    </Row>
                    <Row gutter={16}>
                      <Col xs={24} md={12}>
                        <Form.Item name="name" label="Nama lengkap" rules={[{ required: true, message: 'Nama lengkap wajib diisi.' }]}>
                          <Input />
                        </Form.Item>
                      </Col>
                      <Col xs={24} md={12}>
                        <Form.Item name="preferred_name" label="Nama panggilan"><Input /></Form.Item>
                      </Col>
                      <Col xs={24} md={8}>
                        <Form.Item name="gender" label="Jenis kelamin">
                          <Select allowClear options={[{ value: 'MALE', label: 'Laki-laki' }, { value: 'FEMALE', label: 'Perempuan' }]} />
                        </Form.Item>
                      </Col>
                      <Col xs={24} md={8}>
                        <Form.Item name="birth_place" label="Tempat lahir"><Input /></Form.Item>
                      </Col>
                      <Col xs={24} md={8}>
                        <Form.Item name="birth_date" label="Tanggal lahir"><DatePicker className="w-full" /></Form.Item>
                      </Col>
                      <Col xs={24} md={8}>
                        <Form.Item name="marital_status" label="Status pernikahan">
                          <Select allowClear options={[
                            { value: 'SINGLE', label: 'Belum menikah' },
                            { value: 'MARRIED', label: 'Menikah' },
                            { value: 'DIVORCED', label: 'Cerai' },
                            { value: 'WIDOWED', label: 'Duda/Janda' },
                          ]} />
                        </Form.Item>
                      </Col>
                      <Col xs={24} md={8}>
                        <Form.Item name="nationality" label="Kewarganegaraan"><Input /></Form.Item>
                      </Col>
                      <Col xs={24} md={8}>
                        <Form.Item name="phone" label="Nomor telepon"><Input /></Form.Item>
                      </Col>
                      <Col xs={24} md={12}>
                        <Form.Item name="personal_email" label="Email pribadi" rules={[{ type: 'email', message: 'Format email tidak valid.' }]}>
                          <Input />
                        </Form.Item>
                      </Col>
                      <Col xs={24} md={12}>
                        <Form.Item name="identity_address" label="Alamat sesuai identitas"><Input.TextArea rows={3} /></Form.Item>
                      </Col>
                      <Col xs={24} md={12}>
                        <Form.Item name="domicile_address" label="Alamat domisili"><Input.TextArea rows={3} /></Form.Item>
                      </Col>
                      <Col xs={24} md={12}>
                        <Form.Item name="emergency_contact_name" label="Kontak darurat"><Input /></Form.Item>
                      </Col>
                      <Col xs={24} md={12}>
                        <Form.Item name="emergency_contact_relationship" label="Hubungan kontak darurat"><Input /></Form.Item>
                      </Col>
                      <Col xs={24} md={12}>
                        <Form.Item name="emergency_contact_phone" label="Telepon kontak darurat"><Input /></Form.Item>
                      </Col>
                    </Row>
                  </div>
                ),
              },
              {
                key: 'identity',
                label: 'Identitas',
                children: (
                  <Row gutter={16} className="pt-2">
                    {[
                      ['nik', 'NIK'],
                      ['family_card_number', 'Nomor KK'],
                      ['tax_number', 'NPWP'],
                      ['health_bpjs_number', 'Nomor BPJS Kesehatan'],
                      ['employment_bpjs_number', 'Nomor BPJS Ketenagakerjaan'],
                    ].map(([name, label]) => (
                      <Col xs={24} md={12} key={name}>
                        <Form.Item name={name} label={label}>
                          <Input inputMode="numeric" />
                        </Form.Item>
                      </Col>
                    ))}
                  </Row>
                ),
              },
              {
                key: 'employment',
                label: 'Kepegawaian',
                children: (
                  <Row gutter={16} className="pt-2">
                    <Col xs={24} md={8}><Form.Item name="company_unit" label="Perusahaan / unit kerja"><Input /></Form.Item></Col>
                    <Col xs={24} md={8}>
                      <Form.Item name="department_id" label="Departemen">
                        <Select
                          allowClear
                          showSearch
                          optionFilterProp="label"
                          options={activeDepartments.map((department) => ({ value: department.id, label: `${department.code ?? '-'} - ${department.name}` }))}
                          onChange={() => form.setFieldValue('job_position_id', undefined)}
                        />
                      </Form.Item>
                    </Col>
                    <Col xs={24} md={8}>
                      <Form.Item name="job_position_id" label="Jabatan">
                        <Select
                          allowClear
                          showSearch
                          optionFilterProp="label"
                          options={availablePositions.map((position) => ({ value: position.id, label: `${position.code} - ${position.name}` }))}
                        />
                      </Form.Item>
                    </Col>
                    <Col xs={24} md={8}>
                      <Form.Item name="supervisor_id" label="Atasan langsung">
                        <Select
                          allowClear
                          showSearch
                          optionFilterProp="label"
                          options={activeEmployees.filter((employee) => employee.id !== editing?.id).map((employee) => ({
                            value: employee.id,
                            label: `${employee.employee_number ?? '-'} - ${employee.name}`,
                          }))}
                        />
                      </Form.Item>
                    </Col>
                    <Col xs={24} md={8}><Form.Item name="work_location" label="Lokasi kerja"><Input /></Form.Item></Col>
                    <Col xs={24} md={8}><Form.Item name="join_date" label="Tanggal bergabung"><DatePicker className="w-full" /></Form.Item></Col>
                    <Col xs={24} md={8}>
                      <Form.Item name="employment_status" label="Status karyawan" rules={[{ required: true }]}>
                        <Select options={Object.entries(EMPLOYMENT_STATUS_LABEL).map(([value, label]) => ({ value, label }))} />
                      </Form.Item>
                    </Col>
                    <Col xs={24} md={8}>
                      <Form.Item name="active_status" label="Status aktif" rules={[{ required: true }]}>
                        <Select options={Object.entries(ACTIVE_STATUS_LABEL).map(([value, label]) => ({ value, label }))} />
                      </Form.Item>
                    </Col>
                    <Col xs={24} md={8}>
                      <Form.Item name="work_schedule_type" label="Jenis jadwal kerja" rules={[{ required: true }]}>
                        <Select options={[
                          { value: 'FULL_TIME', label: 'Full-time' },
                          { value: 'PART_TIME', label: 'Part-time' },
                          { value: 'SHIFT', label: 'Shift' },
                        ]} />
                      </Form.Item>
                    </Col>
                    <Col xs={24} md={8}><Form.Item name="contract_start_date" label="Mulai kontrak"><DatePicker className="w-full" /></Form.Item></Col>
                    <Col xs={24} md={8}><Form.Item name="contract_end_date" label="Berakhir kontrak"><DatePicker className="w-full" /></Form.Item></Col>
                    <Col xs={24} md={8}><Form.Item name="permanent_date" label="Pengangkatan tetap"><DatePicker className="w-full" /></Form.Item></Col>
                    <Col xs={24} md={8}><Form.Item name="exit_date" label="Tanggal keluar"><DatePicker className="w-full" /></Form.Item></Col>
                    <Col xs={24} md={16}><Form.Item name="exit_reason" label="Alasan keluar"><Input /></Form.Item></Col>
                    <Col span={24}><Form.Item name="notes" label="Catatan"><Input.TextArea rows={3} /></Form.Item></Col>
                  </Row>
                ),
              },
              ...(canViewPayroll ? [{
                key: 'payroll',
                label: 'Penggajian',
                children: (
                  <fieldset disabled={!canManagePayroll} className="pt-2">
                    {!canManagePayroll && (
                      <Alert className="mb-4" type="info" showIcon message="Anda memiliki akses lihat tanpa akses ubah data penggajian." />
                    )}
                    <Row gutter={16}>
                      <Col xs={24} md={8}>
                        <Form.Item name="salary_payment_method" label="Metode pembayaran">
                          <Select options={[{ value: 'BANK_TRANSFER', label: 'Transfer bank' }, { value: 'CASH', label: 'Tunai' }]} />
                        </Form.Item>
                      </Col>
                      {selectedPaymentMethod === 'BANK_TRANSFER' && (
                        <>
                          <Col xs={24} md={8}><Form.Item name="bank_name" label="Nama bank"><Input /></Form.Item></Col>
                          <Col xs={24} md={8}><Form.Item name="bank_account_number" label="Nomor rekening"><Input inputMode="numeric" /></Form.Item></Col>
                          <Col xs={24} md={12}><Form.Item name="bank_account_holder" label="Pemilik rekening"><Input /></Form.Item></Col>
                        </>
                      )}
                      <Col xs={24} md={8}>
                        <Form.Item name="base_salary" label="Gaji pokok">
                          <InputNumber min={0} controls={false} className="w-full" prefix="Rp" />
                        </Form.Item>
                      </Col>
                      <Col xs={24} md={8}><Form.Item name="salary_currency" label="Mata uang"><Input /></Form.Item></Col>
                      <Col xs={24} md={8}>
                        <Form.Item name="payroll_period" label="Periode penggajian">
                          <Select options={[
                            { value: 'MONTHLY', label: 'Bulanan' },
                            { value: 'WEEKLY', label: 'Mingguan' },
                            { value: 'DAILY', label: 'Harian' },
                          ]} />
                        </Form.Item>
                      </Col>
                      <Col xs={24} md={8}>
                        <Form.Item name="is_taxable" label="Status wajib pajak">
                          <Select options={[{ value: true, label: 'Wajib pajak' }, { value: false, label: 'Tidak wajib pajak' }]} />
                        </Form.Item>
                      </Col>
                      <Col xs={24} md={8}><Form.Item name="ptkp_status" label="PTKP"><Input placeholder="TK/0, K/1, ..." /></Form.Item></Col>
                      <Col xs={24} md={8}>
                        <Form.Item name="is_bpjs_participant" label="Kepesertaan BPJS">
                          <Select options={[{ value: true, label: 'Peserta' }, { value: false, label: 'Bukan peserta' }]} />
                        </Form.Item>
                      </Col>
                    </Row>
                    {canManagePayroll && (
                      <>
                        <Divider>Komponen tunjangan dan potongan</Divider>
                        <Form.List name="salary_components">
                          {(fields, { add, remove }) => (
                            <Space orientation="vertical" className="w-full">
                              {fields.map((field) => (
                                <Space key={field.key} align="baseline" wrap>
                                  <Form.Item
                                    {...field}
                                    name={[field.name, 'salary_component_id']}
                                    rules={[{ required: true, message: 'Pilih komponen.' }]}
                                  >
                                    <Select
                                      className="min-w-64"
                                      placeholder="Pilih komponen"
                                      options={data.salaryComponents.filter((component) => component.is_active).map((component) => ({
                                        value: component.id,
                                        label: `${component.code} - ${component.name}`,
                                      }))}
                                    />
                                  </Form.Item>
                                  <Form.Item {...field} name={[field.name, 'value']} rules={[{ required: true }]}>
                                    <InputNumber min={0} className="w-48" placeholder="Nilai" />
                                  </Form.Item>
                                  <Button danger type="text" onClick={() => remove(field.name)}>Hapus</Button>
                                </Space>
                              ))}
                              <Button type="dashed" onClick={() => add({ value: 0 })} icon={<Plus size={15} />}>
                                Tambah komponen
                              </Button>
                            </Space>
                          )}
                        </Form.List>
                      </>
                    )}
                  </fieldset>
                ),
              }] : []),
            ]}
          />
        </Form>
      </Modal>

      <Drawer
        title={detail ? `${detail.employee_number ?? '-'} - ${detail.name}` : 'Detail karyawan'}
        open={Boolean(detail)}
        width={760}
        onClose={() => setDetail(null)}
        extra={detail && canUpdate ? <Button icon={<Pencil size={16} />} onClick={() => { openEdit(detail); setDetail(null); }}>Edit</Button> : undefined}
      >
        {detail && (
          <Space orientation="vertical" size="large" className="w-full">
            <div className="flex items-center gap-4">
              <Avatar size={80} src={detail.photo_data_url} icon={<UserRound />} />
              <div>
                <Title level={4} className="!mb-1">{detail.name}</Title>
                <Text type="secondary">{detail.job_position_name ?? detail.position ?? 'Belum ada jabatan'}</Text>
                <div className="mt-2">
                  <Tag color={ACTIVE_STATUS_COLOR[detail.active_status ?? (detail.is_active ? 'ACTIVE' : 'INACTIVE')]}>
                    {ACTIVE_STATUS_LABEL[detail.active_status ?? (detail.is_active ? 'ACTIVE' : 'INACTIVE')]}
                  </Tag>
                </div>
              </div>
            </div>
            <Descriptions title="Data pribadi" bordered column={{ xs: 1, sm: 2 }}>
              <Descriptions.Item label="Nama panggilan">{detail.preferred_name ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="Jenis kelamin">{detail.gender === 'MALE' ? 'Laki-laki' : detail.gender === 'FEMALE' ? 'Perempuan' : '-'}</Descriptions.Item>
              <Descriptions.Item label="Tempat, tanggal lahir">
                {[detail.birth_place, detail.birth_date ? dayjs(detail.birth_date).format('DD MMM YYYY') : undefined].filter(Boolean).join(', ') || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="Telepon">{detail.phone ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="Email">{detail.personal_email ?? detail.email ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="Kewarganegaraan">{detail.nationality ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="Alamat identitas" span={2}>{detail.identity_address ?? detail.address ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="Alamat domisili" span={2}>{detail.domicile_address ?? detail.address ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="Kontak darurat">{detail.emergency_contact_name ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="Telepon darurat">{detail.emergency_contact_phone ?? '-'}</Descriptions.Item>
            </Descriptions>
            <Descriptions title="Identitas" bordered column={{ xs: 1, sm: 2 }}>
              <Descriptions.Item label="NIK">{detail.nik ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="Nomor KK">{detail.family_card_number ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="NPWP">{detail.tax_number ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="BPJS Kesehatan">{detail.health_bpjs_number ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="BPJS Ketenagakerjaan">{detail.employment_bpjs_number ?? '-'}</Descriptions.Item>
            </Descriptions>
            <Descriptions title="Kepegawaian" bordered column={{ xs: 1, sm: 2 }}>
              <Descriptions.Item label="Unit kerja">{detail.company_unit ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="Departemen">{detail.department_name ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="Jabatan">{detail.job_position_name ?? detail.position ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="Atasan">{detail.supervisor_name ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="Status">{detail.employment_status ? EMPLOYMENT_STATUS_LABEL[detail.employment_status] : '-'}</Descriptions.Item>
              <Descriptions.Item label="Jadwal">{detail.work_schedule_type?.replace('_', '-') ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="Bergabung">{detail.join_date ? dayjs(detail.join_date).format('DD MMM YYYY') : '-'}</Descriptions.Item>
              <Descriptions.Item label="Kontrak berakhir">{detail.contract_end_date ? dayjs(detail.contract_end_date).format('DD MMM YYYY') : '-'}</Descriptions.Item>
            </Descriptions>
            {canViewPayroll ? (
              <Descriptions title="Penggajian" bordered column={{ xs: 1, sm: 2 }}>
                <Descriptions.Item label="Metode">{detail.salary_payment_method === 'BANK_TRANSFER' ? 'Transfer bank' : 'Tunai'}</Descriptions.Item>
                <Descriptions.Item label="Bank">{detail.bank_name ?? '-'}</Descriptions.Item>
                <Descriptions.Item label="Nomor rekening">{detail.bank_account_number ?? '-'}</Descriptions.Item>
                <Descriptions.Item label="Pemilik rekening">{detail.bank_account_holder ?? '-'}</Descriptions.Item>
                <Descriptions.Item label="Gaji pokok">{formatMoney(detail.base_salary, detail.salary_currency)}</Descriptions.Item>
                <Descriptions.Item label="Periode">{detail.payroll_period ?? '-'}</Descriptions.Item>
                <Descriptions.Item label="PTKP">{detail.ptkp_status ?? '-'}</Descriptions.Item>
                <Descriptions.Item label="BPJS">{detail.is_bpjs_participant ? 'Peserta' : 'Bukan peserta'}</Descriptions.Item>
                <Descriptions.Item label="Komponen" span={2}>
                  {detailAssignments.length > 0 ? (
                    <Space wrap>
                      {detailAssignments.map((assignment) => (
                        <Tag key={assignment.id} color={assignment.kind === 'EARNING' ? 'green' : 'red'}>
                          {assignment.component_name}: {assignment.calculation === 'PERCENTAGE'
                            ? `${assignment.value}%`
                            : formatMoney(assignment.value, detail.salary_currency)}
                        </Tag>
                      ))}
                    </Space>
                  ) : '-'}
                </Descriptions.Item>
              </Descriptions>
            ) : (
              <Alert
                type="warning"
                showIcon
                message="Data penggajian disembunyikan"
                description="Permission hr.payroll.view diperlukan untuk melihat rekening, gaji, pajak, BPJS, dan komponen gaji."
              />
            )}
            {detail.notes && <Paragraph type="secondary">{detail.notes}</Paragraph>}
          </Space>
        )}
      </Drawer>
    </div>
  );
}
