import { useState } from 'react';
import { Table, Button, Modal, Input, InputNumber, Form, Card, Tag, Typography, Statistic } from 'antd';
import { useProfit } from '@/hooks/useProfit';
import { formatCurrency, formatDate } from '@/utils/formatters';
import { Download, ArrowUp, ArrowDown, Wallet, RefreshCw } from 'lucide-react';

const { Title, Text } = Typography;

export default function ProfitManagement() {
  const { balance, logs, isLoading, withdraw, isWithdrawing, recalculate, isRecalculating } = useProfit();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form] = Form.useForm();

  const handleWithdraw = async (values: { amount: number; description: string }) => {
    try {
      await withdraw(values);
      setIsModalOpen(false);
      form.resetFields();
    } catch {
      // Error handled in hook
    }
  };

  const columns = [
    {
      title: 'Tanggal',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (text: string) => formatDate(text),
    },
    {
      title: 'Keterangan',
      dataIndex: 'description',
      key: 'description',
    },
    {
      title: 'Tipe',
      dataIndex: 'type',
      key: 'type',
      render: (type: 'IN' | 'OUT') => (
        <Tag color={type === 'IN' ? 'green' : 'red'}>
          <div className="flex items-center gap-1">
            {type === 'IN' ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
            {type === 'IN' ? 'Masuk' : 'Keluar'}
          </div>
        </Tag>
      ),
    },
    {
      title: 'Jumlah',
      dataIndex: 'amount',
      key: 'amount',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      render: (amount: number, record: any) => (
        <span className={record.type === 'IN' ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
          {record.type === 'IN' ? '+' : '-'} Rp {formatCurrency(amount)}
        </span>
      ),
    },
    {
      title: 'Saldo Akhir',
      dataIndex: 'balance_after',
      key: 'balance_after',
      render: (amount: number) => `Rp ${formatCurrency(amount)}`,
    },
  ];

  return (
    <div className="p-3 sm:p-4 md:p-6 space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <Title level={2} style={{ margin: 0 }}>Manajemen Saldo Keuntungan</Title>
          <Text type="secondary">Pantau dan kelola keuntungan toko Anda</Text>
        </div>
        <div className="flex gap-2">
          <Button
            icon={<RefreshCw size={16} />}
            onClick={() => recalculate()}
            loading={isRecalculating}
            size="large"
          >
            Hitung Ulang
          </Button>
          <Button
            type="primary"
            danger
            icon={<Download size={16} />}
            onClick={() => setIsModalOpen(true)}
            disabled={balance <= 0}
            size="large"
          >
            Tarik Saldo
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <Statistic
            title="Total Saldo Tersedia"
            value={balance}
            precision={0}
            formatter={(value) => `Rp ${formatCurrency(Number(value))}`}
            prefix={<Wallet size={24} className="text-indigo-600 mr-2" />}
            valueStyle={{ color: '#4f46e5', fontWeight: 'bold' }}
          />
        </Card>
      </div>

      <Card title="Riwayat Transaksi Saldo" className="shadow-sm">
        <Table
          dataSource={logs}
          columns={columns}
          rowKey="id"
          loading={isLoading}
          pagination={{ pageSize: 10 }}
          scroll={{ x: 800 }}
        />
      </Card>

      <Modal
        title="Tarik Saldo Keuntungan"
        open={isModalOpen}
        onCancel={() => setIsModalOpen(false)}
        footer={null}
        destroyOnClose
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleWithdraw}
          className="mt-4"
        >
          <Form.Item
            name="amount"
            label="Jumlah Penarikan"
            rules={[
              { required: true, message: 'Harap masukkan jumlah penarikan' },
              {
                type: 'number',
                min: 1,
                message: 'Jumlah harus lebih dari 0'
              },
              {
                validator: async (_, value) => {
                  if (value > balance) {
                    return Promise.reject(new Error('Saldo tidak mencukupi'));
                  }
                },
              },
            ]}
          >
            <InputNumber
              style={{ width: '100%' }}
              formatter={(value) => `Rp ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}
              parser={(value) => value?.replace(/Rp\s?|(\.*)/g, '') as unknown as number}
              placeholder="0"
              size="large"
            />
          </Form.Item>

          <Form.Item
            name="description"
            label="Keterangan"
            rules={[{ required: true, message: 'Harap masukkan keterangan' }]}
          >
            <Input.TextArea placeholder="Contoh: Prive bulan Maret" rows={3} />
          </Form.Item>

          <div className="flex justify-end gap-2 mt-6">
            <Button onClick={() => setIsModalOpen(false)}>
              Batal
            </Button>
            <Button type="primary" htmlType="submit" loading={isWithdrawing} danger>
              Konfirmasi Penarikan
            </Button>
          </div>
        </Form>
      </Modal>
    </div>
  );
}
