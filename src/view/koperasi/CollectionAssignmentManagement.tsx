import { useState } from 'react';
import {
  App,
  Button,
  Card,
  Checkbox,
  DatePicker,
  Form,
  Modal,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Typography,
} from 'antd';
import type { Dayjs } from 'dayjs';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import {
  assignEmployeeArea,
  closeEmployeeAreaAssignment,
  saveCollectionSchedule,
} from '@/services/collectionAssignmentService';
import type { EmployeeArea, EmployeeCollectionSchedule } from '@/types';
import { getCollectionWeekdayLabel } from '@/utils/koperasi/collectionSchedule';
import { toBusinessDateKey } from '@/utils/businessDate';

const { Title, Text } = Typography;

type AreaForm = {
  employee_id: string;
  area_id: string;
  period: [Dayjs, Dayjs?];
  is_primary: boolean;
};

type ScheduleForm = {
  employee_id: string;
  area_id: string;
  weekday: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  period: [Dayjs, Dayjs?];
  is_default_for_new_members: boolean;
};

export default function CollectionAssignmentManagement() {
  const { message } = App.useApp();
  const [areaForm] = Form.useForm<AreaForm>();
  const [scheduleForm] = Form.useForm<ScheduleForm>();
  const [dialog, setDialog] = useState<'area' | 'schedule'>();
  const [closing, setClosing] = useState<EmployeeArea>();
  const [closingDate, setClosingDate] = useState<Dayjs>();
  const [saving, setSaving] = useState(false);
  const data = useLiveQuery(async () => {
    const [employees, areas, assignments, schedules, reviewItems] = await Promise.all([
      db.employees.orderBy('name').toArray(),
      db.cooperativeAreas.orderBy('name').toArray(),
      db.employeeAreas.orderBy('effective_from').reverse().toArray(),
      db.employeeCollectionSchedules.orderBy('updated_at').reverse().toArray(),
      db.implementationReviewQueue.where('status').equals('OPEN').toArray(),
    ]);
    return {
      employees,
      areas: areas.filter((row) => row.is_active),
      assignments,
      schedules,
      reviewItems,
    };
  }, []);
  const employeeById = new Map((data?.employees ?? []).map((row) => [row.id, row]));

  const execute = async (operation: () => Promise<unknown>, success: string) => {
    setSaving(true);
    try {
      await operation();
      message.success(success);
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Perubahan gagal disimpan.');
    } finally {
      setSaving(false);
    }
  };

  const saveArea = async () => {
    const values = await areaForm.validateFields();
    await execute(async () => {
      await assignEmployeeArea({
        employee_id: values.employee_id,
        area_id: values.area_id,
        effective_from: values.period[0].format('YYYY-MM-DD'),
        effective_until: values.period[1]?.format('YYYY-MM-DD'),
        is_primary: values.is_primary,
      });
      setDialog(undefined);
      areaForm.resetFields();
    }, 'Assignment area disimpan.');
  };

  const saveSchedule = async () => {
    const values = await scheduleForm.validateFields();
    await execute(async () => {
      await saveCollectionSchedule({
        employee_id: values.employee_id,
        area_id: values.area_id,
        weekday: values.weekday,
        effective_from: values.period[0].format('YYYY-MM-DD'),
        effective_until: values.period[1]?.format('YYYY-MM-DD'),
        is_default_for_new_members: values.is_default_for_new_members,
      });
      setDialog(undefined);
      scheduleForm.resetFields();
    }, 'Jadwal penagihan disimpan.');
  };

  const finishClose = async () => {
    if (!closing || !closingDate) return;
    await execute(
      () => closeEmployeeAreaAssignment(closing.id, closingDate.format('YYYY-MM-DD')),
      'Assignment area ditutup tanpa menghapus histori.',
    );
    setClosing(undefined);
    setClosingDate(undefined);
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-7xl">
        <Space direction="vertical" size={4} className="mb-5">
          <Title level={2} className="!mb-0">Penugasan Penagihan</Title>
          <Text type="secondary">Assignment area efektif dan jadwal dasar petugas untuk anggota baru.</Text>
        </Space>
        <Tabs
          items={[
            {
              key: 'review',
              label: `Perlu Ditinjau (${data?.reviewItems.length ?? 0})`,
              children: (
                <Card>
                  <Table
                    rowKey="id"
                    dataSource={data?.reviewItems ?? []}
                    columns={[
                      { title: 'Jenis', render: (_, row) => <Tag color="orange">{row.review_type}</Tag> },
                      { title: 'Ringkasan', dataIndex: 'summary' },
                      { title: 'Entity', render: (_, row) => `${row.entity_type} / ${row.entity_id}` },
                      { title: 'Dibuat', render: (_, row) => toBusinessDateKey(row.created_at) },
                    ]}
                  />
                </Card>
              ),
            },
            {
              key: 'schedule',
              label: 'Jadwal Penagihan',
              children: (
                <Card extra={<Button type="primary" onClick={() => setDialog('schedule')}>Jadwal Baru</Button>}>
                  <Table<EmployeeCollectionSchedule>
                    rowKey="id"
                    dataSource={data?.schedules ?? []}
                    columns={[
                      { title: 'Petugas', dataIndex: 'employee_name' },
                      { title: 'Area', render: (_, row) => row.area_code ? `${row.area_code} - ${row.area_name}` : row.area_name },
                      { title: 'Hari', render: (_, row) => getCollectionWeekdayLabel(row.weekday) },
                      { title: 'Periode', render: (_, row) => `${row.effective_from?.slice(0, 10) ?? '-'} s.d. ${row.effective_until?.slice(0, 10) ?? 'terbuka'}` },
                      { title: 'Default', render: (_, row) => row.is_default_for_new_members ? <Tag color="blue">Anggota baru</Tag> : '-' },
                      {
                        title: 'Reassignment',
                        render: (_, row) => {
                          const employee = employeeById.get(row.employee_id);
                          return employee?.is_active && employee.active_status === 'ACTIVE'
                            ? '-'
                            : <Tag color="red">Perlu ditinjau</Tag>;
                        },
                      },
                      { title: 'Status', render: (_, row) => <Tag color={row.is_active ? 'green' : 'default'}>{row.is_active ? 'Aktif' : 'Nonaktif'}</Tag> },
                    ]}
                  />
                </Card>
              ),
            },
            {
              key: 'areas',
              label: 'Assignment Area',
              children: (
                <Card extra={<Button type="primary" onClick={() => setDialog('area')}>Assignment Baru</Button>}>
                  <Table<EmployeeArea>
                    rowKey="id"
                    dataSource={data?.assignments ?? []}
                    columns={[
                      { title: 'Karyawan', render: (_, row) => employeeById.get(row.employee_id)?.name ?? row.employee_id },
                      { title: 'Area', render: (_, row) => row.area_code ? `${row.area_code} - ${row.area_name}` : row.area_name },
                      { title: 'Mulai', render: (_, row) => row.effective_from?.slice(0, 10) ?? toBusinessDateKey(row.created_at) },
                      { title: 'Sampai', render: (_, row) => row.effective_until?.slice(0, 10) ?? 'Terbuka' },
                      { title: 'Prioritas', render: (_, row) => row.is_primary ? <Tag color="blue">Utama</Tag> : '-' },
                      {
                        title: 'Aksi',
                        render: (_, row) => !row.effective_until && (
                          <Button size="small" onClick={() => setClosing(row)}>Tutup Assignment</Button>
                        ),
                      },
                    ]}
                  />
                </Card>
              ),
            },
          ]}
        />
      </div>

      <Modal title="Assignment Area" open={dialog === 'area'} onCancel={() => setDialog(undefined)} onOk={saveArea} confirmLoading={saving} destroyOnHidden>
        <Form form={areaForm} layout="vertical" initialValues={{ is_primary: false }}>
          <Form.Item name="employee_id" label="Karyawan" rules={[{ required: true }]}><Select showSearch optionFilterProp="label" options={(data?.employees ?? []).filter((row) => row.is_active).map((row) => ({ value: row.id, label: row.name }))} /></Form.Item>
          <Form.Item name="area_id" label="Area" rules={[{ required: true }]}><Select options={(data?.areas ?? []).map((row) => ({ value: row.id, label: `${row.code} - ${row.name}` }))} /></Form.Item>
          <Form.Item name="period" label="Periode" rules={[{ required: true }]}><DatePicker.RangePicker allowEmpty={[false, true]} className="w-full" /></Form.Item>
          <Form.Item name="is_primary" valuePropName="checked"><Checkbox>Area utama</Checkbox></Form.Item>
        </Form>
      </Modal>

      <Modal title="Jadwal Penagihan" open={dialog === 'schedule'} onCancel={() => setDialog(undefined)} onOk={saveSchedule} confirmLoading={saving} destroyOnHidden>
        <Form form={scheduleForm} layout="vertical" initialValues={{ is_default_for_new_members: false }}>
          <Form.Item name="employee_id" label="Petugas" rules={[{ required: true }]}><Select showSearch optionFilterProp="label" options={(data?.employees ?? []).filter((row) => row.is_active).map((row) => ({ value: row.id, label: row.name }))} /></Form.Item>
          <Form.Item name="area_id" label="Area" rules={[{ required: true }]}><Select options={(data?.areas ?? []).map((row) => ({ value: row.id, label: `${row.code} - ${row.name}` }))} /></Form.Item>
          <Form.Item name="weekday" label="Hari" rules={[{ required: true }]}><Select options={[1, 2, 3, 4, 5, 6, 7].map((value) => ({ value, label: getCollectionWeekdayLabel(value as 1 | 2 | 3 | 4 | 5 | 6 | 7) }))} /></Form.Item>
          <Form.Item name="period" label="Periode" rules={[{ required: true }]}><DatePicker.RangePicker allowEmpty={[false, true]} className="w-full" /></Form.Item>
          <Form.Item name="is_default_for_new_members" valuePropName="checked"><Checkbox>Default untuk anggota baru di area ini</Checkbox></Form.Item>
        </Form>
      </Modal>

      <Modal title="Tutup Assignment Area" open={Boolean(closing)} onCancel={() => setClosing(undefined)} onOk={finishClose} confirmLoading={saving}>
        <Text className="mb-3 block">Histori tetap disimpan. Jadwal aktif harus ditutup atau dialihkan lebih dahulu.</Text>
        <DatePicker value={closingDate} onChange={(value) => setClosingDate(value ?? undefined)} className="w-full" />
      </Modal>
    </div>
  );
}
