import { useState } from 'react';
import {
  Alert,
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
  Typography,
} from 'antd';
import type { Dayjs } from 'dayjs';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import dayjs from '@/lib/dayjs';
import {
  getCollectionWorklist,
  resolveCoverageConflict,
} from '@/services/collectionCoverageService';
import type {
  CollectionCoverageException,
  CollectionCoverageResolution,
  CollectionWorklistRow,
} from '@/types';
import { formatCurrency } from '@/utils/formatters';

const { Title, Text } = Typography;
type ResolutionForm = {
  resolution_type: CollectionCoverageResolution;
  replacement_employee_id?: string;
  rescheduled_date?: Dayjs;
  reason: string;
};

export default function CollectionCoverageManagement() {
  const { message } = App.useApp();
  const [form] = Form.useForm<ResolutionForm>();
  const [selected, setSelected] = useState<CollectionCoverageException>();
  const [worklistDate, setWorklistDate] = useState(() => dayjs().tz());
  const [saving, setSaving] = useState(false);
  const resolutionType = Form.useWatch('resolution_type', form);
  const data = useLiveQuery(async () => {
    const [conflicts, employees, worklist] = await Promise.all([
      db.collectionCoverageExceptions.orderBy('collection_date').toArray(),
      db.employees.orderBy('name').toArray(),
      getCollectionWorklist(worklistDate.format('YYYY-MM-DD')),
    ]);
    return {
      conflicts,
      employees: employees.filter((row) => row.is_active),
      worklist,
    };
  }, [worklistDate.format('YYYY-MM-DD')]);

  const saveResolution = async () => {
    if (!selected) return;
    const values = await form.validateFields();
    setSaving(true);
    try {
      await resolveCoverageConflict({
        conflict_id: selected.id,
        resolution_type: values.resolution_type,
        replacement_employee_id: values.replacement_employee_id,
        rescheduled_date: values.rescheduled_date?.format('YYYY-MM-DD'),
        reason: values.reason,
      });
      message.success('Coverage berhasil diselesaikan.');
      setSelected(undefined);
      form.resetFields();
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Coverage gagal diselesaikan.');
    } finally {
      setSaving(false);
    }
  };

  const conflictColumns = [
    { title: 'Tanggal', dataIndex: 'collection_date' },
    { title: 'Area', dataIndex: 'area_name' },
    { title: 'Petugas Asal', dataIndex: 'original_employee_name' },
    {
      title: 'Status',
      render: (_: unknown, row: CollectionCoverageException) => (
        <Tag color={row.status === 'OPEN' ? 'red' : row.status === 'RESOLVED' ? 'green' : 'default'}>
          {row.status}
        </Tag>
      ),
    },
    {
      title: 'Resolusi',
      render: (_: unknown, row: CollectionCoverageException) => row.resolution_type === 'SUBSTITUTE'
        ? `Pengganti: ${row.replacement_employee_name}`
        : row.resolution_type === 'RESCHEDULE'
          ? `Pindah: ${row.rescheduled_date}`
          : '-',
    },
    {
      title: 'Aksi',
      render: (_: unknown, row: CollectionCoverageException) => row.status === 'OPEN' && (
        <Button
          type="primary"
          size="small"
          onClick={() => {
            setSelected(row);
            form.setFieldsValue({ resolution_type: 'SUBSTITUTE' });
          }}
        >
          Selesaikan
        </Button>
      ),
    },
  ];

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-7xl">
        <Space direction="vertical" size={4} className="mb-5">
          <Title level={2} className="!mb-0">Konflik Coverage</Title>
          <Text type="secondary">Pengganti atau reschedule berlaku untuk seluruh rute area pada tanggal terkait.</Text>
        </Space>
        <Alert
          className="mb-4"
          type="warning"
          showIcon
          message="Konflik terbuka langsung mengeluarkan petugas asal dari worklist. Penyelesaian coverage wajib online."
        />
        <Tabs
          items={[
            {
              key: 'open',
              label: `Perlu Diselesaikan (${(data?.conflicts ?? []).filter((row) => row.status === 'OPEN').length})`,
              children: (
                <Card>
                  <Table<CollectionCoverageException>
                    rowKey="id"
                    dataSource={(data?.conflicts ?? []).filter((row) => row.status === 'OPEN')}
                    columns={conflictColumns}
                  />
                </Card>
              ),
            },
            {
              key: 'history',
              label: 'Histori',
              children: <Card><Table<CollectionCoverageException> rowKey="id" dataSource={data?.conflicts ?? []} columns={conflictColumns} /></Card>,
            },
            {
              key: 'worklist',
              label: 'Worklist Efektif',
              children: (
                <Card
                  extra={<DatePicker value={worklistDate} onChange={(value) => value && setWorklistDate(value)} />}
                >
                  <Table<CollectionWorklistRow>
                    rowKey={(row) => `${row.collection_schedule_id}:${row.member_id}:${row.operational_date}`}
                    dataSource={data?.worklist ?? []}
                    columns={[
                      { title: 'Anggota', render: (_, row) => `${row.member_number} - ${row.member_name}` },
                      { title: 'Area', dataIndex: 'area_name' },
                      { title: 'Jadwal Dasar', dataIndex: 'scheduled_date' },
                      { title: 'Tanggal Operasional', dataIndex: 'operational_date' },
                      { title: 'Petugas Efektif', render: (_, row) => row.effective_employee_name ?? <Tag color="red">Belum ditentukan</Tag> },
                      { title: 'Target', render: (_, row) => `Rp ${formatCurrency(row.target_amount ?? 0)}` },
                      { title: 'Coverage', render: (_, row) => row.coverage_resolution ? <Tag color="blue">{row.coverage_resolution}</Tag> : 'Normal' },
                      { title: 'Status', render: (_, row) => <Tag color={row.is_blocked ? 'red' : 'green'}>{row.is_blocked ? 'Diblokir' : 'Siap ditagih'}</Tag> },
                    ]}
                  />
                </Card>
              ),
            },
          ]}
        />
      </div>

      <Modal title="Selesaikan Coverage" open={Boolean(selected)} onCancel={() => setSelected(undefined)} onOk={saveResolution} confirmLoading={saving} destroyOnHidden>
        <Form form={form} layout="vertical">
          <Form.Item name="resolution_type" label="Resolusi" rules={[{ required: true }]}>
            <Select options={[
              { value: 'SUBSTITUTE', label: 'Petugas pengganti' },
              { value: 'RESCHEDULE', label: 'Jadwalkan ulang worklist' },
            ]} />
          </Form.Item>
          {resolutionType === 'SUBSTITUTE' ? (
            <Form.Item name="replacement_employee_id" label="Petugas pengganti" rules={[{ required: true }]}>
              <Select
                showSearch
                optionFilterProp="label"
                options={(data?.employees ?? [])
                  .filter((row) => row.id !== selected?.original_employee_id)
                  .map((row) => ({ value: row.id, label: row.name }))}
              />
            </Form.Item>
          ) : (
            <Form.Item name="rescheduled_date" label="Tanggal pengganti" rules={[{ required: true }]}><DatePicker className="w-full" /></Form.Item>
          )}
          <Form.Item name="reason" label="Alasan" rules={[{ required: true }]}><Input.TextArea rows={3} /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
