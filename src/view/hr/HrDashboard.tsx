import { Alert, Card, Col, Empty, Row, Spin, Statistic, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useLiveQuery } from 'dexie-react-hooks';
import { Briefcase, CalendarClock, FileClock, ShieldCheck, UserCheck, Users } from 'lucide-react';
import { db } from '@/lib/db';
import dayjs from '@/lib/dayjs';
import type { EmploymentContract } from '@/types';

const { Title, Text } = Typography;

interface DepartmentDistribution {
  key: string;
  department: string;
  total: number;
}

const contractStatusColor: Record<EmploymentContract['status'], string> = {
  DRAFT: 'default',
  ACTIVE: 'green',
  EXPIRED: 'red',
  RENEWED: 'blue',
  TERMINATED: 'orange',
};

export default function HrDashboard() {
  const result = useLiveQuery(async () => {
    try {
      const [employees, contracts] = await Promise.all([
        db.employees.toArray(),
        db.employmentContracts.toArray(),
      ]);
      const activeEmployees = employees.filter((employee) => (
        employee.is_active && (employee.active_status ?? 'ACTIVE') === 'ACTIVE'
      ));
      const monthStart = dayjs().startOf('month');
      const monthEnd = dayjs().endOf('month');
      const warningLimit = dayjs().add(60, 'day').endOf('day');
      const expiringContracts = contracts
        .filter((contract) => (
          contract.status === 'ACTIVE' &&
          Boolean(contract.end_date) &&
          dayjs(contract.end_date).isAfter(dayjs().subtract(1, 'day')) &&
          dayjs(contract.end_date).isBefore(warningLimit)
        ))
        .sort((left, right) => (left.end_date ?? '').localeCompare(right.end_date ?? ''));

      const distributionMap = activeEmployees.reduce<Map<string, DepartmentDistribution>>((map, employee) => {
        const key = employee.department_id ?? 'unassigned';
        const current = map.get(key) ?? {
          key,
          department: employee.department_name ?? 'Belum ada departemen',
          total: 0,
        };
        current.total += 1;
        map.set(key, current);
        return map;
      }, new Map());

      return {
        data: {
          totalActive: activeEmployees.length,
          permanent: activeEmployees.filter((employee) => employee.employment_status === 'PERMANENT').length,
          contract: activeEmployees.filter((employee) => employee.employment_status === 'CONTRACT').length,
          probation: activeEmployees.filter((employee) => employee.employment_status === 'PROBATION').length,
          joinedThisMonth: employees.filter((employee) => (
            Boolean(employee.join_date) &&
            dayjs(employee.join_date).isAfter(monthStart.subtract(1, 'day')) &&
            dayjs(employee.join_date).isBefore(monthEnd.add(1, 'day'))
          )).length,
          expiringContracts,
          distribution: Array.from(distributionMap.values()).sort((left, right) => right.total - left.total),
        },
      };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : 'Data dashboard HR gagal dimuat.',
      };
    }
  }, []);

  if (!result) {
    return (
      <div className="flex min-h-[360px] items-center justify-center">
        <Spin tip="Memuat dashboard HR..." size="large" />
      </div>
    );
  }

  if ('error' in result) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <Alert type="error" showIcon message="Dashboard HR gagal dimuat" description={result.error} />
      </div>
    );
  }

  const { data } = result;
  const cards = [
    { label: 'Karyawan aktif', value: data.totalActive, icon: Users, color: '#1677ff' },
    { label: 'Karyawan tetap', value: data.permanent, icon: ShieldCheck, color: '#52c41a' },
    { label: 'Karyawan kontrak', value: data.contract, icon: Briefcase, color: '#722ed1' },
    { label: 'Masa percobaan', value: data.probation, icon: FileClock, color: '#fa8c16' },
    { label: 'Masuk bulan ini', value: data.joinedThisMonth, icon: UserCheck, color: '#13c2c2' },
    { label: 'Kontrak segera berakhir', value: data.expiringContracts.length, icon: CalendarClock, color: '#f5222d' },
  ];

  const contractColumns: ColumnsType<EmploymentContract> = [
    {
      title: 'Nomor kontrak',
      dataIndex: 'contract_number',
      sorter: (left, right) => left.contract_number.localeCompare(right.contract_number),
    },
    {
      title: 'Karyawan',
      dataIndex: 'employee_name',
      sorter: (left, right) => left.employee_name.localeCompare(right.employee_name),
    },
    {
      title: 'Departemen / Jabatan',
      render: (_value, contract) => (
        <div>
          <div>{contract.department_name}</div>
          <Text type="secondary">{contract.job_position_name}</Text>
        </div>
      ),
    },
    {
      title: 'Berakhir',
      dataIndex: 'end_date',
      sorter: (left, right) => (left.end_date ?? '').localeCompare(right.end_date ?? ''),
      render: (value?: string) => value ? dayjs(value).format('DD MMM YYYY') : '-',
    },
    {
      title: 'Status',
      dataIndex: 'status',
      render: (status: EmploymentContract['status']) => (
        <Tag color={contractStatusColor[status]}>{status}</Tag>
      ),
    },
  ];

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <div>
        <Title level={2} className="!mb-1">Dashboard HR</Title>
        <Text type="secondary">Ringkasan tenaga kerja dan kontrak yang membutuhkan perhatian.</Text>
      </div>

      <Row gutter={[16, 16]}>
        {cards.map((card) => (
          <Col xs={24} sm={12} lg={8} xl={4} key={card.label}>
            <Card className="h-full">
              <div className="flex items-start justify-between gap-3">
                <Statistic title={card.label} value={card.value} />
                <div className="rounded-xl p-2.5" style={{ color: card.color, backgroundColor: `${card.color}14` }}>
                  <card.icon size={22} />
                </div>
              </div>
            </Card>
          </Col>
        ))}
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={14}>
          <Card title="Kontrak akan berakhir (60 hari)">
            <Table
              rowKey="id"
              columns={contractColumns}
              dataSource={data.expiringContracts}
              pagination={{ pageSize: 5, showSizeChanger: true }}
              scroll={{ x: 760 }}
              locale={{ emptyText: <Empty description="Tidak ada kontrak yang segera berakhir." /> }}
            />
          </Card>
        </Col>
        <Col xs={24} xl={10}>
          <Card title="Distribusi per departemen">
            <Table<DepartmentDistribution>
              rowKey="key"
              size="small"
              columns={[
                {
                  title: 'Departemen',
                  dataIndex: 'department',
                  sorter: (left, right) => left.department.localeCompare(right.department),
                },
                {
                  title: 'Karyawan',
                  dataIndex: 'total',
                  align: 'right',
                  sorter: (left, right) => left.total - right.total,
                  render: (total: number) => <Tag color="blue">{total}</Tag>,
                },
              ]}
              dataSource={data.distribution}
              pagination={{ pageSize: 8, showSizeChanger: true }}
              locale={{ emptyText: <Empty description="Belum ada distribusi karyawan." /> }}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
}
