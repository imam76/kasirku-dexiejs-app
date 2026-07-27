import { useMemo, useState } from 'react';
import {
  App,
  Button,
  Card,
  DatePicker,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  TimePicker,
  Typography,
} from 'antd';
import type { Dayjs } from 'dayjs';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import dayjs from '@/lib/dayjs';
import {
  assignEmployeeWorkSchedule,
  saveCompanyCalendarDay,
  saveWorkScheduleTemplate,
} from '@/services/workforceService';
import type {
  CompanyCalendarDay,
  EmployeeWorkScheduleAssignment,
  WorkScheduleTemplate,
} from '@/types';

const { Title, Text } = Typography;
const WEEKDAYS = [
  { value: 1, label: 'Senin' },
  { value: 2, label: 'Selasa' },
  { value: 3, label: 'Rabu' },
  { value: 4, label: 'Kamis' },
  { value: 5, label: 'Jumat' },
  { value: 6, label: 'Sabtu' },
  { value: 7, label: 'Minggu' },
];

type TemplateForm = {
  code: string;
  name: string;
  weekdays: number[];
  hours: [Dayjs, Dayjs];
};

type AssignmentForm = {
  employee_id: string;
  template_id: string;
  effective_from: Dayjs;
  effective_until?: Dayjs;
};

type CalendarForm = {
  date: Dayjs;
  kind: CompanyCalendarDay['kind'];
  name: string;
};

export default function HrWorkScheduleManagement() {
  const { message } = App.useApp();
  const [templateForm] = Form.useForm<TemplateForm>();
  const [assignmentForm] = Form.useForm<AssignmentForm>();
  const [calendarForm] = Form.useForm<CalendarForm>();
  const [dialog, setDialog] = useState<'template' | 'assignment' | 'calendar'>();
  const [saving, setSaving] = useState(false);
  const data = useLiveQuery(async () => {
    const [templates, assignments, calendar, employees] = await Promise.all([
      db.workScheduleTemplates.orderBy('name').toArray(),
      db.employeeWorkScheduleAssignments.orderBy('effective_from').reverse().toArray(),
      db.companyCalendarDays.orderBy('date').reverse().toArray(),
      db.employees.orderBy('name').toArray(),
    ]);
    return { templates, assignments, calendar, employees: employees.filter((row) => row.is_active) };
  }, []);

  const employeeName = useMemo(
    () => new Map((data?.employees ?? []).map((row) => [row.id, row.name])),
    [data?.employees],
  );

  const saveTemplate = async () => {
    const values = await templateForm.validateFields();
    setSaving(true);
    try {
      const working = new Set(values.weekdays);
      await saveWorkScheduleTemplate({
        code: values.code,
        name: values.name,
        days: WEEKDAYS.map(({ value }) => ({
          weekday: value as 1 | 2 | 3 | 4 | 5 | 6 | 7,
          is_working_day: working.has(value),
          start_time: working.has(value) ? values.hours[0].format('HH:mm') : undefined,
          end_time: working.has(value) ? values.hours[1].format('HH:mm') : undefined,
        })),
      });
      message.success('Template jadwal disimpan.');
      setDialog(undefined);
      templateForm.resetFields();
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Template gagal disimpan.');
    } finally {
      setSaving(false);
    }
  };

  const saveAssignment = async () => {
    const values = await assignmentForm.validateFields();
    setSaving(true);
    try {
      await assignEmployeeWorkSchedule({
        employee_id: values.employee_id,
        template_id: values.template_id,
        effective_from: values.effective_from.format('YYYY-MM-DD'),
        effective_until: values.effective_until?.format('YYYY-MM-DD'),
      });
      message.success('Jadwal kerja karyawan ditetapkan.');
      setDialog(undefined);
      assignmentForm.resetFields();
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Assignment gagal disimpan.');
    } finally {
      setSaving(false);
    }
  };

  const saveCalendar = async () => {
    const values = await calendarForm.validateFields();
    setSaving(true);
    try {
      await saveCompanyCalendarDay({
        date: values.date.format('YYYY-MM-DD'),
        kind: values.kind,
        name: values.name,
      });
      message.success('Kalender perusahaan disimpan.');
      setDialog(undefined);
      calendarForm.resetFields();
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Kalender gagal disimpan.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-7xl">
        <Space direction="vertical" size={4} className="mb-5">
          <Title level={2} className="!mb-0">Jadwal Kerja</Title>
          <Text type="secondary">
            Template jam kerja, periode assignment karyawan, dan hari khusus perusahaan.
          </Text>
        </Space>
        <Tabs
          items={[
            {
              key: 'assignments',
              label: 'Assignment Karyawan',
              children: (
                <Card
                  extra={<Button type="primary" onClick={() => setDialog('assignment')}>Tetapkan Jadwal</Button>}
                >
                  <Table<EmployeeWorkScheduleAssignment>
                    rowKey="id"
                    dataSource={data?.assignments ?? []}
                    columns={[
                      { title: 'Karyawan', render: (_, row) => employeeName.get(row.employee_id) ?? row.employee_id },
                      { title: 'Template', dataIndex: 'template_name' },
                      { title: 'Mulai', dataIndex: 'effective_from' },
                      { title: 'Sampai', render: (_, row) => row.effective_until ?? 'Terbuka' },
                      { title: 'Sync', render: (_, row) => <Tag>{row.sync_status ?? 'lokal'}</Tag> },
                    ]}
                  />
                </Card>
              ),
            },
            {
              key: 'templates',
              label: 'Template',
              children: (
                <Card
                  extra={<Button type="primary" onClick={() => setDialog('template')}>Template Baru</Button>}
                >
                  <Table<WorkScheduleTemplate>
                    rowKey="id"
                    dataSource={data?.templates ?? []}
                    columns={[
                      { title: 'Kode', dataIndex: 'code' },
                      { title: 'Nama', dataIndex: 'name' },
                      { title: 'Timezone', dataIndex: 'timezone' },
                      {
                        title: 'Status',
                        render: (_, row) => <Tag color={row.is_active ? 'green' : 'default'}>{row.is_active ? 'Aktif' : 'Nonaktif'}</Tag>,
                      },
                    ]}
                  />
                </Card>
              ),
            },
            {
              key: 'calendar',
              label: 'Kalender Perusahaan',
              children: (
                <Card
                  extra={<Button type="primary" onClick={() => setDialog('calendar')}>Tambah Hari Khusus</Button>}
                >
                  <Table<CompanyCalendarDay>
                    rowKey="id"
                    dataSource={data?.calendar ?? []}
                    columns={[
                      { title: 'Tanggal', dataIndex: 'date' },
                      { title: 'Keterangan', dataIndex: 'name' },
                      {
                        title: 'Jenis',
                        render: (_, row) => (
                          <Tag color={row.kind === 'HOLIDAY' ? 'red' : 'blue'}>
                            {row.kind === 'HOLIDAY' ? 'Libur' : 'Hari kerja khusus'}
                          </Tag>
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

      <Modal
        title="Template Jadwal"
        open={dialog === 'template'}
        onCancel={() => setDialog(undefined)}
        onOk={saveTemplate}
        confirmLoading={saving}
        destroyOnHidden
      >
        <Form
          form={templateForm}
          layout="vertical"
          initialValues={{
            weekdays: [1, 2, 3, 4, 5],
            hours: [dayjs('2000-01-01T08:00:00'), dayjs('2000-01-01T17:00:00')],
          }}
        >
          <Form.Item name="code" label="Kode" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="name" label="Nama" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="weekdays" label="Hari kerja" rules={[{ required: true }]}>
            <Select mode="multiple" options={WEEKDAYS} />
          </Form.Item>
          <Form.Item name="hours" label="Jam kerja" rules={[{ required: true }]}>
            <TimePicker.RangePicker format="HH:mm" className="w-full" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Tetapkan Jadwal Karyawan"
        open={dialog === 'assignment'}
        onCancel={() => setDialog(undefined)}
        onOk={saveAssignment}
        confirmLoading={saving}
        destroyOnHidden
      >
        <Form form={assignmentForm} layout="vertical">
          <Form.Item name="employee_id" label="Karyawan" rules={[{ required: true }]}>
            <Select showSearch optionFilterProp="label" options={(data?.employees ?? []).map((row) => ({ value: row.id, label: row.name }))} />
          </Form.Item>
          <Form.Item name="template_id" label="Template" rules={[{ required: true }]}>
            <Select options={(data?.templates ?? []).filter((row) => row.is_active).map((row) => ({ value: row.id, label: `${row.code} - ${row.name}` }))} />
          </Form.Item>
          <Form.Item name="effective_from" label="Berlaku mulai" rules={[{ required: true }]}><DatePicker className="w-full" /></Form.Item>
          <Form.Item name="effective_until" label="Berlaku sampai"><DatePicker className="w-full" /></Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Hari Khusus Perusahaan"
        open={dialog === 'calendar'}
        onCancel={() => setDialog(undefined)}
        onOk={saveCalendar}
        confirmLoading={saving}
        destroyOnHidden
      >
        <Form form={calendarForm} layout="vertical" initialValues={{ kind: 'HOLIDAY' }}>
          <Form.Item name="date" label="Tanggal" rules={[{ required: true }]}><DatePicker className="w-full" /></Form.Item>
          <Form.Item name="kind" label="Jenis" rules={[{ required: true }]}>
            <Select options={[
              { value: 'HOLIDAY', label: 'Hari libur' },
              { value: 'WORKING_OVERRIDE', label: 'Hari kerja khusus' },
            ]} />
          </Form.Item>
          <Form.Item name="name" label="Keterangan" rules={[{ required: true }]}><Input /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
