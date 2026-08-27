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
  InputNumber,
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
import { useAuth } from '@/auth/useAuth';
import { useBaseCurrency } from '@/hooks/useBaseCurrency';
import { db } from '@/lib/db';
import type { SalaryComponentInput } from '@/lib/validations/hr';
import { createSalaryComponent, updateSalaryComponent } from '@/services/hrService';
import type { SalaryComponent, SalaryComponentKind } from '@/types';
import { formatCurrency, formatCurrencyInput, parseCurrencyInput } from '@/utils/formatters';

const { Title, Text } = Typography;

type StatusFilter = 'ACTIVE' | 'INACTIVE' | 'ALL';
type KindFilter = SalaryComponentKind | 'ALL';

const KIND_LABEL: Record<SalaryComponentKind, string> = {
  EARNING: 'Pendapatan',
  DEDUCTION: 'Potongan',
};

export default function HrSalaryComponentManagement() {
  const { message } = App.useApp();
  const { can } = useAuth();
  const [form] = Form.useForm<SalaryComponentInput>();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('ALL');
  const [kind, setKind] = useState<KindFilter>('ALL');
  const [editing, setEditing] = useState<SalaryComponent | null>(null);
  const [detail, setDetail] = useState<SalaryComponent | null>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const canManage = can('hr.payroll.manage');
  const { baseCurrencySymbol } = useBaseCurrency();
  const selectedCalculation = Form.useWatch('calculation', form) ?? 'FIXED';
  const isPercentage = selectedCalculation === 'PERCENTAGE';

  const result = useLiveQuery(async () => {
    try {
      return { data: await db.salaryComponents.orderBy('name').toArray() };
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Komponen gaji gagal dimuat.' };
    }
  }, []);
  const components = useMemo<SalaryComponent[]>(() => result?.data ?? [], [result?.data]);
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return components.filter((component) => (
      (!query || [component.code, component.name].some((value) => value.toLowerCase().includes(query))) &&
      (status === 'ALL' || component.is_active === (status === 'ACTIVE')) &&
      (kind === 'ALL' || component.kind === kind)
    ));
  }, [components, kind, search, status]);

  useEffect(() => setPage(1), [search, status, kind]);

  const openCreate = () => {
    setEditing(null);
    form.setFieldsValue({
      code: '',
      name: '',
      kind: 'EARNING',
      calculation: 'FIXED',
      default_value: 0,
      is_taxable: false,
      is_active: true,
    });
    setOpen(true);
  };
  const openEdit = (component: SalaryComponent) => {
    setEditing(component);
    form.setFieldsValue(component);
    setOpen(true);
  };
  const submit = async (values: SalaryComponentInput) => {
    setSaving(true);
    try {
      if (editing) await updateSalaryComponent(editing.id, values);
      else await createSalaryComponent(values);
      message.success(editing ? 'Komponen gaji berhasil diperbarui.' : 'Komponen gaji berhasil ditambahkan.');
      setOpen(false);
      setEditing(null);
      form.resetFields();
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Komponen gaji gagal disimpan.');
    } finally {
      setSaving(false);
    }
  };
  const toggleStatus = async (component: SalaryComponent) => {
    try {
      await updateSalaryComponent(component.id, { ...component, is_active: !component.is_active });
      message.success(component.is_active ? 'Komponen dinonaktifkan.' : 'Komponen diaktifkan.');
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Status komponen gagal diubah.');
    }
  };

  const columns: ColumnsType<SalaryComponent> = [
    { title: 'Kode', dataIndex: 'code', sorter: (left, right) => left.code.localeCompare(right.code), render: (value: string) => <Text code>{value}</Text> },
    { title: 'Nama komponen', dataIndex: 'name', sorter: (left, right) => left.name.localeCompare(right.name) },
    {
      title: 'Jenis',
      dataIndex: 'kind',
      sorter: (left, right) => left.kind.localeCompare(right.kind),
      render: (value: SalaryComponentKind) => <Tag color={value === 'EARNING' ? 'green' : 'red'}>{KIND_LABEL[value]}</Tag>,
    },
    {
      title: 'Perhitungan',
      dataIndex: 'calculation',
      sorter: (left, right) => left.calculation.localeCompare(right.calculation),
      render: (value: SalaryComponent['calculation']) => value === 'FIXED' ? 'Nominal tetap' : 'Persentase',
    },
    {
      title: 'Nilai default',
      dataIndex: 'default_value',
      sorter: (left, right) => left.default_value - right.default_value,
      render: (value: number, component) => component.calculation === 'PERCENTAGE'
        ? `${value}%`
        : `${baseCurrencySymbol} ${formatCurrency(value)}`,
    },
    { title: 'Kena pajak', dataIndex: 'is_taxable', render: (value: boolean) => value ? <Tag color="orange">Ya</Tag> : 'Tidak' },
    { title: 'Status', dataIndex: 'is_active', sorter: (left, right) => Number(right.is_active) - Number(left.is_active), render: (value: boolean) => <Tag color={value ? 'green' : 'default'}>{value ? 'Aktif' : 'Nonaktif'}</Tag> },
    {
      title: 'Aksi',
      fixed: 'right',
      width: 270,
      render: (_value, component) => (
        <Space wrap>
          <Button type="text" icon={<Eye size={16} />} onClick={() => setDetail(component)}>Lihat</Button>
          {canManage && (
            <>
              <Button type="text" icon={<Pencil size={16} />} onClick={() => openEdit(component)}>Edit</Button>
              <Popconfirm
                title={component.is_active ? 'Nonaktifkan komponen?' : 'Aktifkan komponen?'}
                okText={component.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                cancelText="Batal"
                onConfirm={() => toggleStatus(component)}
              >
                <Button danger={component.is_active} type="text" icon={component.is_active ? <Power size={16} /> : <RotateCcw size={16} />}>
                  {component.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                </Button>
              </Popconfirm>
            </>
          )}
        </Space>
      ),
    },
  ];

  if (!result) return <div className="flex min-h-[360px] items-center justify-center"><Spin tip="Memuat komponen gaji..." /></div>;
  if ('error' in result) return <div className="p-4 sm:p-6 lg:p-8"><Alert type="error" showIcon message="Komponen gaji gagal dimuat" description={result.error} /></div>;

  return (
    <div className="space-y-5 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <Title level={2} className="!mb-1">Komponen Gaji</Title>
          <Text type="secondary">Konfigurasi pendapatan dan potongan; MVP tidak menghitung payroll otomatis.</Text>
        </div>
        {canManage && <Button type="primary" icon={<Plus size={16} />} onClick={openCreate}>Tambah komponen</Button>}
      </div>
      <Card>
        <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
          <Input.Search allowClear placeholder="Cari kode atau nama..." value={search} onChange={(event) => setSearch(event.target.value)} />
          <Select value={kind} onChange={setKind} options={[{ value: 'ALL', label: 'Semua jenis' }, { value: 'EARNING', label: 'Pendapatan' }, { value: 'DEDUCTION', label: 'Potongan' }]} />
          <Select value={status} onChange={setStatus} options={[{ value: 'ALL', label: 'Semua status' }, { value: 'ACTIVE', label: 'Aktif' }, { value: 'INACTIVE', label: 'Nonaktif' }]} />
        </div>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={filtered}
          scroll={{ x: 1100 }}
          onChange={(pagination: TablePaginationConfig) => {
            setPage(pagination.current ?? 1);
            setPageSize(pagination.pageSize ?? 10);
          }}
          pagination={{ current: page, pageSize, total: filtered.length, showSizeChanger: true, showTotal: (total) => `${total} komponen` }}
          locale={{ emptyText: <Empty description="Belum ada komponen gaji yang sesuai filter." /> }}
        />
      </Card>

      <Modal
        title={editing ? 'Edit komponen gaji' : 'Tambah komponen gaji'}
        open={open}
        onCancel={() => { setOpen(false); setEditing(null); form.resetFields(); }}
        onOk={() => form.submit()}
        confirmLoading={saving}
        okText="Simpan"
        cancelText="Batal"
        destroyOnHidden
      >
        <Form form={form} layout="vertical" onFinish={submit}>
          <Form.Item name="code" label="Kode komponen" rules={[{ required: true, message: 'Kode wajib diisi.' }]}><Input maxLength={30} /></Form.Item>
          <Form.Item name="name" label="Nama komponen" rules={[{ required: true, message: 'Nama wajib diisi.' }]}><Input /></Form.Item>
          <Form.Item name="kind" label="Jenis" rules={[{ required: true }]}>
            <Select options={[{ value: 'EARNING', label: 'Pendapatan' }, { value: 'DEDUCTION', label: 'Potongan' }]} />
          </Form.Item>
          <Form.Item name="calculation" label="Perhitungan" rules={[{ required: true }]}>
            <Select options={[{ value: 'FIXED', label: 'Nominal tetap' }, { value: 'PERCENTAGE', label: 'Persentase' }]} />
          </Form.Item>
          <Alert
            className="mb-4"
            type="info"
            showIcon
            message={isPercentage ? 'Persentase dari gaji pokok' : `Nominal tetap dalam ${baseCurrencySymbol}`}
            description={isPercentage
              ? 'Masukkan 2 untuk 2%. Nilai assignment per karyawan dapat memakai metode yang berbeda.'
              : 'Pemisah ribuan akan diformat otomatis. Nilai assignment per karyawan dapat memakai metode yang berbeda.'}
          />
          <Form.Item
            name="default_value"
            label={isPercentage ? 'Persentase default' : 'Nominal default'}
            rules={[
              { required: true, message: 'Nilai default wajib diisi.' },
              {
                validator: async (_, value) => {
                  if (isPercentage && Number(value || 0) > 100) {
                    throw new Error('Persentase maksimal 100%.');
                  }
                },
              },
            ]}
          >
            <InputNumber
              min={0}
              max={isPercentage ? 100 : undefined}
              precision={isPercentage ? 2 : undefined}
              controls={false}
              prefix={isPercentage ? undefined : baseCurrencySymbol}
              suffix={isPercentage ? '%' : undefined}
              formatter={isPercentage ? undefined : formatCurrencyInput}
              parser={isPercentage ? undefined : parseCurrencyInput}
              className="w-full"
              placeholder={isPercentage ? 'Contoh: 2' : 'Contoh: 500.000'}
            />
          </Form.Item>
          <Form.Item name="is_taxable" label="Kena pajak" valuePropName="checked"><Switch /></Form.Item>
          <Form.Item name="is_active" label="Status aktif" valuePropName="checked"><Switch /></Form.Item>
        </Form>
      </Modal>

      <Drawer title={detail ? `${detail.code} - ${detail.name}` : 'Detail komponen'} open={Boolean(detail)} width={520} onClose={() => setDetail(null)}>
        {detail && (
          <Descriptions bordered column={1}>
            <Descriptions.Item label="Jenis"><Tag color={detail.kind === 'EARNING' ? 'green' : 'red'}>{KIND_LABEL[detail.kind]}</Tag></Descriptions.Item>
            <Descriptions.Item label="Perhitungan">{detail.calculation === 'FIXED' ? 'Nominal tetap' : 'Persentase'}</Descriptions.Item>
            <Descriptions.Item label="Nilai default">{detail.calculation === 'PERCENTAGE' ? `${detail.default_value}%` : `${baseCurrencySymbol} ${formatCurrency(detail.default_value)}`}</Descriptions.Item>
            <Descriptions.Item label="Kena pajak">{detail.is_taxable ? 'Ya' : 'Tidak'}</Descriptions.Item>
            <Descriptions.Item label="Status">{detail.is_active ? 'Aktif' : 'Nonaktif'}</Descriptions.Item>
          </Descriptions>
        )}
      </Drawer>
    </div>
  );
}
