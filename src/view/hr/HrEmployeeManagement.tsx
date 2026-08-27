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
  Switch,
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
import { AUTH_PIN_LENGTH, AUTH_PIN_VALIDATION_MESSAGE } from '@/auth/pinPolicy';
import { CURRENCY_PRESETS } from '@/constants/currencies';
import { db } from '@/lib/db';
import dayjs from '@/lib/dayjs';
import type { HrEmployeeInput } from '@/lib/validations/hr';
import { getCurrencySymbol } from '@/services/baseCurrencyService';
import {
  createHrEmployee,
  setHrEmployeeActiveStatus,
  updateHrEmployee,
  upsertEmployeeSalaryComponent,
} from '@/services/hrService';
import { formatCurrencyInput, parseCurrencyInput } from '@/utils/formatters';
import {
  createOrLinkEmployeeUser,
  updateEmployeeAccess,
} from '@/services/employeeAccessService';
import type {
  Department,
  Employee,
  EmployeeArea,
  EmployeeActiveStatus,
  EmployeeCollectionSchedule,
  EmployeeEmploymentStatus,
  EmployeeSalaryComponent,
  EmployeeWorkScheduleAssignment,
  HrPosition,
  LeaveRequest,
  Role,
  SalaryComponent,
  SalaryComponentCalculation,
  WorkScheduleTemplate,
  AuthUser,
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
  calculation?: SalaryComponentCalculation;
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

type EmployeeAccessFormValues = {
  email: string;
  role_id: string;
  pin?: string;
  is_active: boolean;
};

interface EmployeeDataResult {
  employees: Employee[];
  departments: Department[];
  positions: HrPosition[];
  salaryComponents: SalaryComponent[];
  assignments: EmployeeSalaryComponent[];
  authUsers: AuthUser[];
  roles: Role[];
  workScheduleAssignments: EmployeeWorkScheduleAssignment[];
  workScheduleTemplates: WorkScheduleTemplate[];
  leaveRequests: LeaveRequest[];
  areaAssignments: EmployeeArea[];
  collectionSchedules: EmployeeCollectionSchedule[];
}

const toDateValue = (value: string | undefined) => value ? dayjs(value) : undefined;
const toDateString = (value: Dayjs | undefined) => value?.format('YYYY-MM-DD');
const salaryCurrencyOptions = Object.entries(CURRENCY_PRESETS).map(([value, currency]) => ({
  value,
  label: `${currency.name} (${currency.symbol})`,
}));
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
  const [accessForm] = Form.useForm<EmployeeAccessFormValues>();
  const [search, setSearch] = useState('');
  const [activeStatus, setActiveStatus] = useState<EmployeeActiveStatus | 'ALL'>('ALL');
  const [departmentId, setDepartmentId] = useState<string | 'ALL'>('ALL');
  const [employmentStatus, setEmploymentStatus] = useState<EmployeeEmploymentStatus | 'ALL'>('ALL');
  const [editing, setEditing] = useState<Employee | null>(null);
  const [detail, setDetail] = useState<Employee | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [accessEmployee, setAccessEmployee] = useState<Employee | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const canCreate = can('hr.employee.create');
  const canUpdate = can('hr.employee.update');
  const canDeactivate = can('hr.employee.deactivate');
  const canViewPayroll = can('hr.payroll.view');
  const canManagePayroll = can('hr.payroll.manage');
  const canViewSchedule = can('hr.schedule.manage');
  const canViewLeave = can('hr.leave.hr_approve') || can('hr.leave.supervisor_approve');
  const canViewCollectionAssignment = can('cooperative.collection.assignment.manage');
  const canViewAccess = can('USER_MANAGE');

  const result = useLiveQuery(async () => {
    try {
      const [
        employees,
        departments,
        positions,
        salaryComponents,
        assignments,
        authUsers,
        roles,
        workScheduleAssignments,
        workScheduleTemplates,
        leaveRequests,
        areaAssignments,
        collectionSchedules,
      ] = await Promise.all([
        db.employees.orderBy('name').toArray(),
        db.departments.orderBy('name').toArray(),
        db.hrPositions.orderBy('name').toArray(),
        db.salaryComponents.orderBy('name').toArray(),
        db.employeeSalaryComponents.toArray(),
        db.authUsers.toArray(),
        db.roles.toArray(),
        db.employeeWorkScheduleAssignments.toArray(),
        db.workScheduleTemplates.toArray(),
        db.leaveRequests.toArray(),
        db.employeeAreas.toArray(),
        db.employeeCollectionSchedules.toArray(),
      ]);
      return {
        data: {
          employees,
          departments,
          positions,
          salaryComponents,
          assignments,
          authUsers,
          roles,
          workScheduleAssignments,
          workScheduleTemplates,
          leaveRequests,
          areaAssignments,
          collectionSchedules,
        },
      };
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
    authUsers: [],
    roles: [],
    workScheduleAssignments: [],
    workScheduleTemplates: [],
    leaveRequests: [],
    areaAssignments: [],
    collectionSchedules: [],
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
  const selectedSalaryCurrency = Form.useWatch('salary_currency', form) ?? 'IDR';
  const selectedSalarySymbol = getCurrencySymbol(selectedSalaryCurrency);
  const selectedSalaryAssignments = Form.useWatch('salary_components', form) ?? [];
  const availablePositions = data.positions.filter((position) => (
    position.is_active && (!selectedDepartmentId || position.department_id === selectedDepartmentId)
  ));

  const resetAndCloseForm = () => {
    setFormOpen(false);
    setEditing(null);
    form.resetFields();
  };

  const openAccessForm = (employee: Employee) => {
    const user = data.authUsers.find((row) => row.employee_id === employee.id);
    accessForm.setFieldsValue({
      email: user?.email ?? employee.personal_email ?? employee.email ?? '',
      role_id: user?.role_id,
      pin: undefined,
      is_active: user?.is_active ?? true,
    });
    setAccessEmployee(employee);
  };

  const saveAccess = async () => {
    if (!accessEmployee) return;
    const values = await accessForm.validateFields();
    const existing = data.authUsers.find((row) => row.employee_id === accessEmployee.id);
    setSaving(true);
    try {
      if (existing) {
        await updateEmployeeAccess({
          employee_id: accessEmployee.id,
          email: values.email,
          role_id: values.role_id,
          pin: values.pin,
          is_active: values.is_active,
        });
      } else {
        if (!values.pin) throw new Error('PIN wajib diisi saat membuat user aplikasi.');
        await createOrLinkEmployeeUser({
          employee_id: accessEmployee.id,
          email: values.email,
          role_id: values.role_id,
          pin: values.pin,
        });
      }
      message.success(existing ? 'Akses aplikasi diperbarui.' : 'User aplikasi dibuat dan dihubungkan.');
      setAccessEmployee(null);
      accessForm.resetFields();
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Akses aplikasi gagal disimpan.');
    } finally {
      setSaving(false);
    }
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
        calculation: assignment.calculation,
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

  const handleSubmit = async () => {
    const values = form.getFieldsValue(true) as EmployeeFormValues;
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
            calculation: assignment.calculation,
            value: assignment.value,
            is_active: true,
          })),
          ...removedAssignments.map((assignment) => upsertEmployeeSalaryComponent(employee.id, {
            salary_component_id: assignment.salary_component_id,
            calculation: assignment.calculation,
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
  const detailUser = detail ? data.authUsers.find((user) => user.employee_id === detail.id) : undefined;
  const detailRole = detailUser?.role_id ? data.roles.find((role) => role.id === detailUser.role_id) : undefined;
  const detailWorkSchedules = detail
    ? data.workScheduleAssignments.filter((assignment) => assignment.employee_id === detail.id)
    : [];
  const detailLeaveRequests = detail
    ? data.leaveRequests.filter((request) => request.employee_id === detail.id)
    : [];
  const detailAreas = detail
    ? data.areaAssignments.filter((assignment) => assignment.employee_id === detail.id)
    : [];
  const detailCollectionSchedules = detail
    ? data.collectionSchedules.filter((schedule) => schedule.employee_id === detail.id)
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
                          <InputNumber
                            min={0}
                            controls={false}
                            className="w-full"
                            prefix={selectedSalarySymbol}
                            formatter={formatCurrencyInput}
                            parser={parseCurrencyInput}
                          />
                        </Form.Item>
                      </Col>
                      <Col xs={24} md={8}>
                        <Form.Item name="salary_currency" label="Mata uang">
                          <Select showSearch optionFilterProp="label" options={salaryCurrencyOptions} />
                        </Form.Item>
                      </Col>
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
                              {fields.map((field) => {
                                const assignment = selectedSalaryAssignments[field.name] as SalaryAssignmentValue | undefined;
                                const component = data.salaryComponents.find(
                                  (candidate) => candidate.id === assignment?.salary_component_id,
                                );
                                const calculation = assignment?.calculation
                                  ?? component?.calculation
                                  ?? 'FIXED';
                                const isPercentage = calculation === 'PERCENTAGE';

                                return (
                                  <div key={field.key} className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                                    <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(260px,1fr)_180px_220px_auto] md:items-start">
                                      <Form.Item
                                        name={[field.name, 'salary_component_id']}
                                        label="Komponen"
                                        rules={[{ required: true, message: 'Pilih komponen.' }]}
                                        className="mb-0"
                                      >
                                        <Select
                                          showSearch
                                          optionFilterProp="label"
                                          placeholder="Pilih komponen"
                                          options={data.salaryComponents.filter((candidate) => candidate.is_active).map((candidate) => ({
                                            value: candidate.id,
                                            label: `${candidate.code} - ${candidate.name} • ${candidate.kind === 'EARNING' ? 'Pendapatan' : 'Potongan'} • ${candidate.calculation === 'PERCENTAGE' ? 'Persentase' : 'Nominal tetap'}`,
                                          }))}
                                          onChange={(componentId: string) => {
                                            const nextComponent = data.salaryComponents.find(
                                              (candidate) => candidate.id === componentId,
                                            );
                                            form.setFieldValue(
                                              ['salary_components', field.name, 'calculation'],
                                              nextComponent?.calculation ?? 'FIXED',
                                            );
                                            form.setFieldValue(
                                              ['salary_components', field.name, 'value'],
                                              nextComponent?.default_value ?? 0,
                                            );
                                          }}
                                        />
                                      </Form.Item>

                                      <Form.Item
                                        name={[field.name, 'calculation']}
                                        label="Metode"
                                        rules={[{ required: true, message: 'Pilih metode.' }]}
                                        className="mb-0"
                                      >
                                        <Select
                                          options={[
                                            { value: 'FIXED', label: 'Nominal tetap' },
                                            { value: 'PERCENTAGE', label: 'Persentase' },
                                          ]}
                                          onChange={(nextCalculation: SalaryComponentCalculation) => {
                                            const currentValue = Number(
                                              form.getFieldValue(['salary_components', field.name, 'value']) || 0,
                                            );
                                            if (nextCalculation === 'PERCENTAGE' && currentValue > 100) {
                                              form.setFieldValue(['salary_components', field.name, 'value'], 0);
                                            }
                                          }}
                                        />
                                      </Form.Item>

                                      <Form.Item
                                        name={[field.name, 'value']}
                                        label={isPercentage ? 'Persentase' : 'Nominal'}
                                        rules={[
                                          { required: true, message: 'Nilai wajib diisi.' },
                                          {
                                            validator: async (_, value) => {
                                              if (isPercentage && Number(value || 0) > 100) {
                                                throw new Error('Persentase maksimal 100%.');
                                              }
                                            },
                                          },
                                        ]}
                                        className="mb-0"
                                      >
                                        <InputNumber
                                          min={0}
                                          max={isPercentage ? 100 : undefined}
                                          precision={isPercentage ? 2 : undefined}
                                          controls={false}
                                          prefix={isPercentage ? undefined : selectedSalarySymbol}
                                          suffix={isPercentage ? '%' : undefined}
                                          formatter={isPercentage ? undefined : formatCurrencyInput}
                                          parser={isPercentage ? undefined : parseCurrencyInput}
                                          className="w-full"
                                          placeholder={isPercentage ? 'Contoh: 2' : 'Contoh: 500.000'}
                                        />
                                      </Form.Item>

                                      <Button
                                        danger
                                        type="text"
                                        className="md:mt-7"
                                        onClick={() => remove(field.name)}
                                      >
                                        Hapus
                                      </Button>
                                    </div>
                                    <Space size={[4, 4]} wrap className="mt-3">
                                      {component && (
                                        <Tag color={component.kind === 'EARNING' ? 'green' : 'red'}>
                                          {component.kind === 'EARNING' ? 'Pendapatan (+)' : 'Potongan (-)'}
                                        </Tag>
                                      )}
                                      <Text type="secondary" className="text-xs">
                                        {isPercentage
                                          ? 'Dihitung dari gaji pokok. Contoh: 2 berarti 2%, bukan Rp2.'
                                          : `Nominal tetap dalam ${selectedSalarySymbol}; pemisah ribuan diformat otomatis.`}
                                      </Text>
                                    </Space>
                                  </div>
                                );
                              })}
                              <Button
                                type="dashed"
                                onClick={() => add({ calculation: 'FIXED', value: 0 })}
                                icon={<Plus size={15} />}
                              >
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
                          {assignment.kind === 'EARNING' ? '(+) ' : '(-) '}
                          {assignment.component_name}: {assignment.calculation === 'PERCENTAGE'
                            ? `${assignment.value}% dari gaji pokok`
                            : `${formatMoney(assignment.value, detail.salary_currency)} tetap`}
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
            <Tabs
              items={[
                ...(canViewAccess ? [{
                  key: 'access',
                  label: 'Akses',
                  children: (
                    <Space direction="vertical" className="w-full">
                      <Descriptions bordered column={1} size="small">
                        <Descriptions.Item label="User aplikasi">{detailUser?.email ?? 'Belum dibuat'}</Descriptions.Item>
                        <Descriptions.Item label="Role">{detailRole?.name ?? detailUser?.role_name ?? '-'}</Descriptions.Item>
                        <Descriptions.Item label="Login">
                          <Tag color={detailUser?.is_active ? 'green' : 'default'}>
                            {detailUser?.is_active ? 'Aktif' : 'Nonaktif'}
                          </Tag>
                        </Descriptions.Item>
                        <Descriptions.Item label="Sumber credential">auth_users</Descriptions.Item>
                      </Descriptions>
                      <Button onClick={() => openAccessForm(detail)}>
                        {detailUser ? 'Ubah Akses' : 'Buat User Aplikasi'}
                      </Button>
                    </Space>
                  ),
                }] : []),
                ...(canViewSchedule ? [{
                  key: 'work-schedule',
                  label: 'Jadwal Kerja',
                  children: detailWorkSchedules.length > 0 ? (
                    <Table
                      size="small"
                      rowKey="id"
                      pagination={false}
                      dataSource={detailWorkSchedules}
                      columns={[
                        { title: 'Template', dataIndex: 'template_name' },
                        { title: 'Mulai', dataIndex: 'effective_from' },
                        { title: 'Sampai', render: (_, row) => row.effective_until ?? 'Terbuka' },
                      ]}
                    />
                  ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Belum ada assignment jadwal kerja." />,
                }] : []),
                ...(canViewLeave ? [{
                  key: 'leave',
                  label: 'Cuti',
                  children: detailLeaveRequests.length > 0 ? (
                    <Table
                      size="small"
                      rowKey="id"
                      pagination={false}
                      dataSource={detailLeaveRequests}
                      columns={[
                        { title: 'Tipe', dataIndex: 'leave_type_name' },
                        { title: 'Periode', render: (_, row) => `${row.start_date} s.d. ${row.end_date}` },
                        { title: 'Hari', dataIndex: 'day_count' },
                        { title: 'Status', render: (_, row) => <Tag>{row.status}</Tag> },
                      ]}
                    />
                  ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Belum ada pengajuan cuti." />,
                }] : []),
                ...(canViewCollectionAssignment ? [{
                  key: 'areas',
                  label: 'Area',
                  children: detailAreas.length > 0 ? (
                    <Table
                      size="small"
                      rowKey="id"
                      pagination={false}
                      dataSource={detailAreas}
                      columns={[
                        { title: 'Area', dataIndex: 'area_name' },
                        { title: 'Mulai', render: (_, row) => row.effective_from ?? row.created_at.slice(0, 10) },
                        { title: 'Sampai', render: (_, row) => row.effective_until ?? 'Terbuka' },
                        { title: 'Utama', render: (_, row) => row.is_primary ? <Tag color="blue">Ya</Tag> : '-' },
                      ]}
                    />
                  ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Belum ada assignment area." />,
                }, {
                  key: 'collection-schedule',
                  label: 'Jadwal Penagihan',
                  children: detailCollectionSchedules.length > 0 ? (
                    <Table
                      size="small"
                      rowKey="id"
                      pagination={false}
                      dataSource={detailCollectionSchedules}
                      columns={[
                        { title: 'Area', dataIndex: 'area_name' },
                        { title: 'Hari', dataIndex: 'weekday' },
                        { title: 'Mulai', render: (_, row) => row.effective_from?.slice(0, 10) ?? '-' },
                        { title: 'Sampai', render: (_, row) => row.effective_until?.slice(0, 10) ?? 'Terbuka' },
                        { title: 'Default', render: (_, row) => row.is_default_for_new_members ? <Tag color="blue">Ya</Tag> : '-' },
                      ]}
                    />
                  ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Belum ada jadwal penagihan." />,
                }] : []),
              ]}
            />
            {detail.notes && <Paragraph type="secondary">{detail.notes}</Paragraph>}
          </Space>
        )}
      </Drawer>
      <Modal
        title={accessEmployee ? `Akses Aplikasi — ${accessEmployee.name}` : 'Akses Aplikasi'}
        open={Boolean(accessEmployee)}
        onCancel={() => setAccessEmployee(null)}
        onOk={saveAccess}
        confirmLoading={saving}
        destroyOnHidden
      >
        <Alert
          className="mb-4"
          type="info"
          showIcon
          message="Employee tidak otomatis memperoleh akses aplikasi. Credential hanya disimpan di auth_users."
        />
        <Form form={accessForm} layout="vertical">
          <Form.Item name="email" label="Email login" rules={[{ required: true, type: 'email' }]}><Input /></Form.Item>
          <Form.Item name="role_id" label="Role" rules={[{ required: true }]}>
            <Select options={data.roles.filter((role) => role.is_active).map((role) => ({ value: role.id, label: role.name }))} />
          </Form.Item>
          <Form.Item
            name="pin"
            label={detailUser ? 'PIN baru (opsional)' : 'PIN'}
            rules={[
              ...(detailUser ? [] : [{ required: true, message: 'PIN wajib diisi.' }]),
              { len: AUTH_PIN_LENGTH, message: AUTH_PIN_VALIDATION_MESSAGE },
              { pattern: /^\d+$/, message: AUTH_PIN_VALIDATION_MESSAGE },
            ]}
          >
            <Input.Password inputMode="numeric" maxLength={AUTH_PIN_LENGTH} />
          </Form.Item>
          <Form.Item name="is_active" label="Login aktif" valuePropName="checked"><Switch /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
