import { useState, useMemo } from 'react';
import { Table, Button, Modal, Input, InputNumber, Form, Card, Tag, Typography, Statistic, Select, Space, Row, Col } from 'antd';
import { useFinance } from '@/hooks/useFinance';
import { formatCurrency, formatDate } from '@/utils/formatters';
import { 
  ArrowUpCircle, 
  ArrowDownCircle, 
  Wallet, 
  RefreshCw, 
  Plus, 
  Minus, 
  Banknote,
  TrendingUp,
  TrendingDown,
  LayoutDashboard
} from 'lucide-react';
import { FinanceTransactionType } from '@/types';

const { Title, Text } = Typography;
const { Option } = Select;

export default function FinanceManagement() {
  const { balance, transactions, isLoading, addTransaction, isAdding, recalculate, isRecalculating } = useFinance();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalType, setModalType] = useState<FinanceTransactionType>('INCOME');
  const [form] = Form.useForm();

  const summary = useMemo(() => {
    return transactions.reduce((acc, t) => {
      if (t.type === 'OPENING_BALANCE') acc.opening += t.amount;
      else if (t.type === 'INCOME') acc.income += t.amount;
      else if (t.type === 'EXPENSE') acc.expense += t.amount;
      return acc;
    }, { opening: 0, income: 0, expense: 0 });
  }, [transactions]);

  const handleAddTransaction = async (values: { amount: number; category: string; description: string }) => {
    try {
      await addTransaction({
        type: modalType,
        ...values
      });
      setIsModalOpen(false);
      form.resetFields();
    } catch {
      // Error handled in hook
    }
  };

  const openModal = (type: FinanceTransactionType) => {
    setModalType(type);
    setIsModalOpen(true);
    
    // Set default category based on type
    if (type === 'OPENING_BALANCE') {
      form.setFieldsValue({ category: 'SALDO_AWAL', description: 'Saldo awal hari ini' });
    } else if (type === 'INCOME') {
      form.setFieldsValue({ category: 'LAINNYA', description: '' });
    } else if (type === 'EXPENSE') {
      form.setFieldsValue({ category: 'OPERASIONAL', description: '' });
    }
  };

  const columns = [
    {
      title: 'Tanggal',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (text: string) => formatDate(text),
      width: 180,
    },
    {
      title: 'Kategori',
      dataIndex: 'category',
      key: 'category',
      render: (cat: string) => <Tag color="blue">{cat}</Tag>,
      width: 120,
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
      render: (type: FinanceTransactionType) => {
        let color = 'green';
        let icon = <ArrowUpCircle size={14} />;
        let label = 'Pemasukan';

        if (type === 'EXPENSE') {
          color = 'red';
          icon = <ArrowDownCircle size={14} />;
          label = 'Pengeluaran';
        } else if (type === 'OPENING_BALANCE') {
          color = 'blue';
          icon = <Banknote size={14} />;
          label = 'Saldo Awal';
        }

        return (
          <Tag color={color}>
            <div className="flex items-center gap-1">
              {icon}
              {label}
            </div>
          </Tag>
        );
      },
      width: 130,
    },
    {
      title: 'Jumlah',
      dataIndex: 'amount',
      key: 'amount',
      render: (amount: number, record: any) => (
        <span className={record.type === 'EXPENSE' ? 'text-red-600 font-medium' : 'text-green-600 font-medium'}>
          {record.type === 'EXPENSE' ? '-' : '+'} Rp {formatCurrency(amount)}
        </span>
      ),
      width: 150,
    },
  ];

  return (
    <div className="p-3 sm:p-4 md:p-6 space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <Title level={2} style={{ margin: 0 }}>Manajemen Keuangan</Title>
          <Text type="secondary">Pantau arus kas, pemasukan, dan pengeluaran toko</Text>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            icon={<RefreshCw size={16} />}
            onClick={() => recalculate()}
            loading={isRecalculating}
          >
            Hitung Ulang
          </Button>
          <Button
            icon={<Banknote size={16} />}
            onClick={() => openModal('OPENING_BALANCE')}
          >
            Saldo Awal
          </Button>
          <Button
            type="primary"
            icon={<Plus size={16} />}
            onClick={() => openModal('INCOME')}
            className="bg-green-600 hover:bg-green-700 border-none"
          >
            Pemasukan
          </Button>
          <Button
            type="primary"
            danger
            icon={<Minus size={16} />}
            onClick={() => openModal('EXPENSE')}
          >
            Pengeluaran
          </Button>
        </div>
      </div>

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} md={6}>
          <Card className="shadow-sm border-l-4 border-l-blue-500">
            <Statistic
              title="Saldo Awal"
              value={summary.opening}
              formatter={(value) => `Rp ${formatCurrency(Number(value))}`}
              prefix={<Banknote size={20} className="text-blue-500 mr-2" />}
              valueStyle={{ fontSize: '1.25rem', fontWeight: 'bold' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card className="shadow-sm border-l-4 border-l-green-500">
            <Statistic
              title="Total Pemasukan"
              value={summary.income}
              formatter={(value) => `Rp ${formatCurrency(Number(value))}`}
              prefix={<TrendingUp size={20} className="text-green-500 mr-2" />}
              valueStyle={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#16a34a' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card className="shadow-sm border-l-4 border-l-red-500">
            <Statistic
              title="Total Pengeluaran"
              value={summary.expense}
              formatter={(value) => `Rp ${formatCurrency(Number(value))}`}
              prefix={<TrendingDown size={20} className="text-red-500 mr-2" />}
              valueStyle={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#dc2626' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card className="shadow-sm border-l-4 border-l-indigo-600 bg-indigo-50">
            <Statistic
              title="Uang di Tangan (Net)"
              value={balance}
              formatter={(value) => `Rp ${formatCurrency(Number(value))}`}
              prefix={<Wallet size={20} className="text-indigo-600 mr-2" />}
              valueStyle={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#4f46e5' }}
            />
          </Card>
        </Col>
      </Row>

      <Card 
        title={
          <div className="flex items-center gap-2">
            <LayoutDashboard size={18} />
            <span>Riwayat Transaksi Keuangan</span>
          </div>
        } 
        className="shadow-sm"
      >
        <Table
          dataSource={transactions}
          columns={columns}
          rowKey="id"
          loading={isLoading}
          pagination={{ pageSize: 10 }}
          scroll={{ x: 800 }}
        />
      </Card>

      <Modal
        title={
          modalType === 'OPENING_BALANCE' ? 'Set Saldo Awal' : 
          modalType === 'INCOME' ? 'Tambah Pemasukan Manual' : 
          'Catat Pengeluaran'
        }
        open={isModalOpen}
        onCancel={() => setIsModalOpen(false)}
        footer={null}
        destroyOnClose
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleAddTransaction}
          className="mt-4"
        >
          <Form.Item
            name="amount"
            label="Jumlah"
            rules={[
              { required: true, message: 'Harap masukkan jumlah' },
              { type: 'number', min: 1, message: 'Jumlah harus lebih dari 0' }
            ]}
          >
            <InputNumber
              style={{ width: '100%' }}
              formatter={(value) => `Rp ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}
              parser={(value) => value?.replace(/Rp\s?|(\.*)/g, '') as unknown as number}
              placeholder="0"
              size="large"
              autoFocus
            />
          </Form.Item>

          <Form.Item
            name="category"
            label="Kategori"
            rules={[{ required: true, message: 'Harap pilih/isi kategori' }]}
          >
            {modalType === 'OPENING_BALANCE' ? (
              <Input disabled />
            ) : (
              <Select showSearch allowClear placeholder="Pilih atau ketik kategori baru">
                {modalType === 'INCOME' ? (
                  <>
                    <Option value="LAINNYA">Lainnya</Option>
                    <Option value="DEPOSIT">Deposit</Option>
                    <Option value="LAYANAN">Biaya Layanan</Option>
                    <Option value="BONUS">Bonus/Hibah</Option>
                  </>
                ) : (
                  <>
                    <Option value="HPP">HPP (Modal Barang)</Option>
                    <Option value="OPERASIONAL">Operasional (Listrik, Sewa, dll)</Option>
                    <Option value="GAJI">Gaji Karyawan</Option>
                    <Option value="PERLENGKAPAN">Perlengkapan Toko</Option>
                    <Option value="MAKAN">Makan/Minum</Option>
                    <Option value="TRANSPORT">Transportasi</Option>
                  </>
                )}
              </Select>
            )}
          </Form.Item>

          <Form.Item
            name="description"
            label="Keterangan"
            rules={[{ required: true, message: 'Harap masukkan keterangan' }]}
          >
            <Input.TextArea placeholder="Contoh: Pembayaran listrik bulan ini" rows={3} />
          </Form.Item>

          <div className="flex justify-end gap-2 mt-6">
            <Button onClick={() => setIsModalOpen(false)}>
              Batal
            </Button>
            <Button 
              type="primary" 
              htmlType="submit" 
              loading={isAdding}
              danger={modalType === 'EXPENSE'}
              className={modalType === 'INCOME' ? 'bg-green-600 hover:bg-green-700 border-none' : ''}
            >
              Simpan Transaksi
            </Button>
          </div>
        </Form>
      </Modal>
    </div>
  );
}
