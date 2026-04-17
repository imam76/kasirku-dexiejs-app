import { useState, useEffect } from 'react';
import { Table, Button, Modal, Form, Input, InputNumber, App, Tag, Space, Card, Typography } from 'antd';
import { Plus, Trash2, Scale, RefreshCcw, Edit2 } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/db';
import { UnitConversion } from '@/types';
import { setConversionRegistry } from '@/utils/pricing';
import { DEFAULT_CONVERSIONS } from '@/constants/units';

const { Title, Text } = Typography;

export default function UnitManagement() {
  const queryClient = useQueryClient();
  const { message, modal } = App.useApp();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<UnitConversion | null>(null);
  const [form] = Form.useForm();

  // Fetch conversions
  const { data: conversions = [], isLoading } = useQuery({
    queryKey: ['unitConversions'],
    queryFn: async () => {
      const data = await db.unitConversions.toArray();
      setConversionRegistry(data);
      return data;
    },
  });

  // Update global registry when data changes
  useEffect(() => {
    if (conversions.length > 0) {
      setConversionRegistry(conversions);
    }
  }, [conversions]);

  // Add/Update mutation
  const upsertMutation = useMutation({
    mutationFn: async (values: Omit<UnitConversion, 'id' | 'isPreset' | 'label'>) => {
      const id = editingRecord ? editingRecord.id : `${values.fromUnit}-${values.toUnit}`;
      const label = `1 ${values.fromUnit} = ${values.ratio} ${values.toUnit}`;
      
      if (editingRecord) {
        // Update existing
        await db.unitConversions.update(editingRecord.id, {
          ratio: values.ratio,
          label,
        });
      } else {
        // Add new
        const newConversion: UnitConversion = {
          ...values,
          id,
          isPreset: false,
          label,
        };
        await db.unitConversions.add(newConversion);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['unitConversions'] });
      message.success(editingRecord ? 'Konversi satuan berhasil diperbarui' : 'Konversi satuan berhasil ditambahkan');
      setIsModalOpen(false);
      setEditingRecord(null);
      form.resetFields();
    },
    onError: (error: any) => {
      if (error.name === 'ConstraintError') {
        message.error('Kombinasi satuan ini sudah ada');
      } else {
        message.error('Gagal menyimpan konversi');
      }
    },
  });

  // Restore defaults mutation
  const restoreMutation = useMutation({
    mutationFn: async () => {
      // Use bulkPut to upsert (replace if exists, add if not)
      await db.unitConversions.bulkPut(DEFAULT_CONVERSIONS);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['unitConversions'] });
      message.success('Satuan bawaan berhasil dipulihkan');
    },
  });

  const handleRestoreDefaults = () => {
    modal.confirm({
      title: 'Pulihkan Satuan Bawaan',
      content: 'Ini akan memulihkan semua satuan bawaan sistem. Konversi custom Anda tidak akan terhapus.',
      okText: 'Pulihkan',
      cancelText: 'Batal',
      onOk: () => restoreMutation.mutate(),
    });
  };

  const handleEdit = (record: UnitConversion) => {
    setEditingRecord(record);
    form.setFieldsValue({
      fromUnit: record.fromUnit,
      toUnit: record.toUnit,
      ratio: record.ratio,
    });
    setIsModalOpen(true);
  };

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await db.unitConversions.delete(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['unitConversions'] });
      message.success('Konversi satuan berhasil dihapus');
    },
  });

  const handleDelete = (record: UnitConversion) => {
    if (record.isPreset) return;

    modal.confirm({
      title: 'Hapus Konversi',
      content: `Apakah Anda yakin ingin menghapus konversi "${record.label}"?`,
      okText: 'Hapus',
      okType: 'danger',
      cancelText: 'Batal',
      onOk: () => deleteMutation.mutate(record.id),
    });
  };

  const columns = [
    {
      title: 'Dari Satuan',
      dataIndex: 'fromUnit',
      key: 'fromUnit',
      render: (text: string) => <Tag color="blue">{text}</Tag>,
    },
    {
      title: 'Ke Satuan',
      dataIndex: 'toUnit',
      key: 'toUnit',
      render: (text: string) => <Tag color="green">{text}</Tag>,
    },
    {
      title: 'Rasio',
      dataIndex: 'ratio',
      key: 'ratio',
      render: (val: number) => <Text strong>{val}</Text>,
    },
    {
      title: 'Keterangan',
      dataIndex: 'label',
      key: 'label',
    },
    {
      title: 'Tipe',
      dataIndex: 'isPreset',
      key: 'isPreset',
      render: (isPreset: boolean) => (
        isPreset ? <Tag color="gold">Bawaan</Tag> : <Tag color="cyan">Custom</Tag>
      ),
    },
    {
      title: 'Aksi',
      key: 'action',
      render: (_: any, record: UnitConversion) => (
        <Space>
          <Button
            type="text"
            icon={<Edit2 size={16} />}
            onClick={() => handleEdit(record)}
            className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
          />
          <Button
            danger
            type="text"
            icon={<Trash2 size={16} />}
            disabled={record.isPreset}
            onClick={() => handleDelete(record)}
          />
        </Space>
      ),
    },
  ];

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-100 text-blue-600 rounded-lg">
            <Scale size={24} />
          </div>
          <div>
            <Title level={4} style={{ margin: 0 }}>Manajemen Satuan & Konversi</Title>
            <Text type="secondary">Kelola cara aplikasi mengonversi harga antar satuan berbeda</Text>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            icon={<RefreshCcw size={16} />}
            onClick={handleRestoreDefaults}
            loading={restoreMutation.isPending}
            className="flex items-center gap-2"
          >
            Pulihkan Bawaan
          </Button>
          <Button
            type="primary"
            icon={<Plus size={16} />}
            onClick={() => {
              setEditingRecord(null);
              form.resetFields();
              setIsModalOpen(true);
            }}
            className="flex items-center gap-2"
          >
            Tambah Konversi
          </Button>
        </div>
      </div>

      <Card className="shadow-sm">
        <Table
          dataSource={conversions}
          columns={columns}
          rowKey="id"
          loading={isLoading}
          pagination={{ pageSize: 10 }}
          scroll={{ x: true }}
        />
      </Card>

      <Modal
        title={editingRecord ? 'Edit Konversi' : 'Tambah Konversi Baru'}
        open={isModalOpen}
        onCancel={() => {
          setIsModalOpen(false);
          setEditingRecord(null);
        }}
        onOk={() => form.submit()}
        confirmLoading={upsertMutation.isPending}
        destroyOnClose
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={(values) => upsertMutation.mutate(values)}
          initialValues={{ ratio: 1 }}
          className="mt-4"
        >
          <div className="grid grid-cols-2 gap-4">
            <Form.Item
              name="fromUnit"
              label="Dari Satuan"
              rules={[{ required: true, message: 'Wajib diisi' }]}
              extra="Contoh: ikat, dus, jam"
            >
              <Input placeholder="ikat" disabled={editingRecord?.isPreset} />
            </Form.Item>
            <Form.Item
              name="toUnit"
              label="Ke Satuan"
              rules={[{ required: true, message: 'Wajib diisi' }]}
              extra="Contoh: pcs, box, menit"
            >
              <Input placeholder="pcs" disabled={editingRecord?.isPreset} />
            </Form.Item>
          </div>

          <Form.Item
            name="ratio"
            label="Isi / Rasio"
            rules={[{ required: true, message: 'Wajib diisi' }, { type: 'number', min: 0.000001, message: 'Harus > 0' }]}
            extra="1 [Dari Satuan] = Berapa [Ke Satuan]?"
          >
            <InputNumber className="w-full" placeholder="Contoh: 10" />
          </Form.Item>

          <div className="bg-blue-50 p-3 rounded-lg border border-blue-100">
            <Text type="secondary" className="text-xs">
              Tip: Jika Anda menjual "Kangkung" per **ikat** yang berisi 10 **pcs**, maka:
              <br />
              - Dari: **ikat**
              <br />
              - Ke: **pcs**
              <br />
              - Rasio: **10**
            </Text>
          </div>
        </Form>
      </Modal>
    </div>
  );
}
