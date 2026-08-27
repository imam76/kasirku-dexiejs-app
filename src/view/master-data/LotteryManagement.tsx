import { useEffect, useState } from 'react';
import { App, Button, Card, DatePicker, Form, Input, InputNumber, Modal, Space, Switch, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { Dayjs } from 'dayjs';
import { useLiveQuery } from 'dexie-react-hooks';
import { Edit2, Plus, Ticket, Trash2 } from 'lucide-react';
import { db } from '@/lib/db';
import dayjs from '@/lib/dayjs';
import { createLottery, deleteLottery, updateLottery, type LotteryFormInput } from '@/services/lotteryService';
import type { Lottery } from '@/types';
import { formatCurrency } from '@/utils/formatters';

const { Text } = Typography;

interface LotteryFormValues {
  name: string;
  min_total: number;
  max_total?: number | null;
  start_at?: Dayjs | null;
  end_at?: Dayjs | null;
  active: boolean;
}

const getRangeLabel = (lottery: Lottery) => (
  lottery.max_total != null
    ? `Rp ${formatCurrency(lottery.min_total)} - Rp ${formatCurrency(lottery.max_total)}`
    : `Rp ${formatCurrency(lottery.min_total)} ke atas`
);

const getPeriodLabel = (lottery: Lottery) => {
  const start = lottery.start_at ? dayjs(lottery.start_at).tz().format('DD MMM YYYY HH:mm') : 'Sekarang';
  const end = lottery.end_at ? dayjs(lottery.end_at).tz().format('DD MMM YYYY HH:mm') : 'Tanpa batas';

  return `${start} - ${end}`;
};

const toLotteryFormInput = (values: LotteryFormValues): LotteryFormInput => ({
  name: values.name,
  min_total: Number(values.min_total),
  max_total: values.max_total ?? null,
  start_at: values.start_at?.toISOString() ?? null,
  end_at: values.end_at?.toISOString() ?? null,
  active: Boolean(values.active),
});

const getLotteryFormValues = (lottery: Lottery): LotteryFormValues => ({
  name: lottery.name,
  min_total: lottery.min_total,
  max_total: lottery.max_total ?? null,
  start_at: lottery.start_at ? dayjs(lottery.start_at) : null,
  end_at: lottery.end_at ? dayjs(lottery.end_at) : null,
  active: lottery.active,
});

export default function LotteryManagement() {
  const { message, modal } = App.useApp();
  const [form] = Form.useForm<LotteryFormValues>();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingLottery, setEditingLottery] = useState<Lottery | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const lotteries = useLiveQuery(
    () => db.lotteries.orderBy('created_at').reverse().toArray(),
    [],
    [],
  );

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingLottery(null);
    form.resetFields();
  };

  const handleAdd = () => {
    setEditingLottery(null);
    setIsModalOpen(true);
  };

  const handleEdit = (lottery: Lottery) => {
    setEditingLottery(lottery);
    setIsModalOpen(true);
  };

  useEffect(() => {
    if (!isModalOpen) return;

    form.resetFields();
    form.setFieldsValue(editingLottery
      ? getLotteryFormValues(editingLottery)
      : {
          active: true,
        });
  }, [editingLottery, form, isModalOpen]);

  const handleSubmit = async (values: LotteryFormValues) => {
    try {
      setIsSubmitting(true);
      const input = toLotteryFormInput(values);

      if (editingLottery) {
        await updateLottery(editingLottery.id, input);
        message.success('Undian berhasil diperbarui.');
      } else {
        await createLottery(input);
        message.success('Undian berhasil ditambahkan.');
      }

      closeModal();
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Gagal menyimpan undian.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = (lottery: Lottery) => {
    modal.confirm({
      title: 'Hapus undian?',
      content: `Pengaturan undian "${lottery.name}" akan dihapus. Transaksi lama tetap menyimpan nomor undian yang sudah tercetak.`,
      okText: 'Hapus',
      okType: 'danger',
      cancelText: 'Batal',
      onOk: async () => {
        try {
          await deleteLottery(lottery.id);
          message.success('Undian berhasil dihapus.');
        } catch (error) {
          message.error(error instanceof Error ? error.message : 'Gagal menghapus undian.');
        }
      },
    });
  };

  const columns: ColumnsType<Lottery> = [
    {
      title: 'Undian',
      dataIndex: 'name',
      key: 'name',
      render: (name: string) => <Text strong>{name}</Text>,
    },
    {
      title: 'Rentang Pembelian',
      key: 'range',
      render: (_value: unknown, lottery) => getRangeLabel(lottery),
    },
    {
      title: 'Periode',
      key: 'period',
      render: (_value: unknown, lottery) => (
        <span className="text-xs text-gray-600">{getPeriodLabel(lottery)}</span>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'active',
      key: 'active',
      render: (active: boolean) => active ? <Tag color="green">Aktif</Tag> : <Tag>Nonaktif</Tag>,
    },
    {
      title: 'Aksi',
      key: 'action',
      render: (_value: unknown, lottery) => (
        <Space wrap>
          <Button type="text" icon={<Edit2 size={16} />} onClick={() => handleEdit(lottery)}>
            Edit
          </Button>
          <Button danger type="text" icon={<Trash2 size={16} />} onClick={() => handleDelete(lottery)}>
            Hapus
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <Card
      className="shadow-md"
      title={(
        <div className="flex items-center gap-2">
          <Ticket className="h-5 w-5" />
          Undian
        </div>
      )}
    >
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Button type="primary" icon={<Plus size={16} />} onClick={handleAdd}>
          Tambah Undian
        </Button>
      </div>

      <Table
        dataSource={lotteries}
        columns={columns}
        rowKey="id"
        pagination={{ pageSize: 6 }}
        scroll={{ x: true }}
      />

      <Modal
        title={editingLottery ? 'Edit Undian' : 'Tambah Undian'}
        open={isModalOpen}
        onCancel={closeModal}
        onOk={() => form.submit()}
        confirmLoading={isSubmitting}
        destroyOnHidden
        forceRender
        width={640}
      >
        <Form<LotteryFormValues>
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          requiredMark={false}
          className="mt-4"
        >
          <Form.Item
            name="name"
            label="Nama Undian"
            rules={[{ required: true, message: 'Nama undian wajib diisi.' }]}
          >
            <Input placeholder="Contoh: Undian Akhir Tahun" />
          </Form.Item>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Form.Item
              name="min_total"
              label="Minimal Pembelian"
              rules={[{ required: true, message: 'Minimal pembelian wajib diisi.' }]}
            >
              <InputNumber min={1} className="w-full" prefix="Rp" />
            </Form.Item>
            <Form.Item name="max_total" label="Maksimal Pembelian">
              <InputNumber min={1} className="w-full" prefix="Rp" placeholder="Opsional, tanpa batas jika kosong" />
            </Form.Item>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Form.Item name="start_at" label="Mulai">
              <DatePicker showTime className="w-full" />
            </Form.Item>
            <Form.Item name="end_at" label="Selesai">
              <DatePicker showTime className="w-full" />
            </Form.Item>
          </div>

          <Form.Item name="active" label="Status" valuePropName="checked">
            <Switch checkedChildren="Aktif" unCheckedChildren="Nonaktif" />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
