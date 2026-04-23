import { useState } from 'react';
import { Controller } from 'react-hook-form';
import { Table, Button, Input, InputNumber, Select, Card, Typography, Form, Row, Col, Modal } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { Plus, Trash2, Save, History } from 'lucide-react';
import { useShoppingNote } from '@/hooks/useShoppingNote';
import { ShoppingNoteItem } from '@/types';
import ShoppingNoteHistory from './ShoppingNoteHistory';

const { Text } = Typography;
const { Option } = Select;

export default function ShoppingNote() {
  const [historyOpen, setHistoryOpen] = useState(false);
  const {
    items,
    moneyCarried,
    setMoneyCarried,
    removeItem,
    totalShopping,
    remainingMoney,
    control,
    handleSubmit,
    errors,
    saveNote,
    loadNote,
  } = useShoppingNote();

  const columns: ColumnsType<ShoppingNoteItem> = [
    {
      title: 'Nama Barang',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: 'Harga Satuan',
      dataIndex: 'unit_price',
      key: 'unit_price',
      render: (val: number) => `Rp ${val.toLocaleString()}`,
      responsive: ['md'],
    },
    {
      title: 'Jumlah',
      dataIndex: 'quantity',
      key: 'quantity',
      render: (val: number, record: ShoppingNoteItem) => (
        <span>{val} {record.unit}</span>
      )
    },
    {
      title: 'Unit',
      dataIndex: 'unit',
      key: 'unit',
      responsive: ['md'],
    },
    {
      title: 'Subtotal',
      dataIndex: 'subtotal',
      key: 'subtotal',
      render: (val: number) => `Rp ${val.toLocaleString()}`,
    },
    {
      title: 'Aksi',
      key: 'action',
      render: (_: unknown, record: ShoppingNoteItem) => (
        <Button danger icon={<Trash2 size={16} />} onClick={() => removeItem(record.id)} />
      ),
    },
  ];

  return (
    <div className="p-3 sm:p-4 md:p-6 pb-24 sm:pb-6">
      <div className="mb-4 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="min-w-0 text-lg font-bold text-gray-800 sm:text-xl md:text-2xl">Catatan Belanja</h2>
        <div className="flex gap-2 w-full sm:w-auto">
          <Button 
            className="flex-1 sm:flex-none"
            icon={<History size={16} />} 
            onClick={() => setHistoryOpen(true)}
          >
            Riwayat
          </Button>
          <Button 
            className="flex-1 sm:flex-none"
            type="primary" 
            icon={<Save size={16} />} 
            onClick={saveNote} 
            disabled={items.length === 0}
          >
            Simpan
          </Button>
        </div>
      </div>

      <Row gutter={[16, 16]}>
        <Col xs={24} md={8}>
          <Card title="Input Barang" bordered={false} className="shadow-sm">
            <div className="mb-4">
              <Text strong className="mb-1 block">Uang Dibawa:</Text>
              <InputNumber
                style={{ width: '100%' }}
                value={moneyCarried}
                onChange={(val) => setMoneyCarried(val || 0)}
                formatter={(value) => `Rp ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                parser={(value) => value?.replace(/Rp\s?|(,*)/g, '') as unknown as number}
                placeholder="Masukkan jumlah uang"
                size="large"
              />
            </div>

            <form onSubmit={handleSubmit}>
              <div className="flex flex-col gap-4">
                <div>
                  <div className="mb-1"><Text strong>Nama Barang</Text></div>
                  <Controller
                    name="name"
                    control={control}
                    render={({ field }) => (
                      <Form.Item validateStatus={errors.name ? 'error' : ''} help={errors.name?.message} style={{ marginBottom: 0 }}>
                        <Input {...field} placeholder="Nama Barang" size="large" />
                      </Form.Item>
                    )}
                  />
                </div>

                <div>
                  <div className="mb-1"><Text strong>Harga Satuan</Text></div>
                  <Controller
                    name="unit_price"
                    control={control}
                    render={({ field }) => (
                      <Form.Item validateStatus={errors.unit_price ? 'error' : ''} help={errors.unit_price?.message} style={{ marginBottom: 0 }}>
                        <InputNumber
                          {...field}
                          style={{ width: '100%' }}
                          placeholder="Harga Satuan"
                          formatter={(value) => `Rp ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                          parser={(value) => value?.replace(/Rp\s?|(,*)/g, '') as unknown as number}
                          size="large"
                        />
                      </Form.Item>
                    )}
                  />
                </div>

                <div className="flex gap-2">
                  <div style={{ flex: 1 }}>
                    <div className="mb-1"><Text strong>Jumlah</Text></div>
                    <Controller
                      name="quantity"
                      control={control}
                      render={({ field }) => (
                        <Form.Item validateStatus={errors.quantity ? 'error' : ''} help={errors.quantity?.message} style={{ marginBottom: 0 }}>
                          <InputNumber {...field} style={{ width: '100%' }} placeholder="Qty" min={0.01} size="large" />
                        </Form.Item>
                      )}
                    />
                  </div>

                  <div style={{ width: 120 }}>
                    <div className="mb-1"><Text strong>Unit</Text></div>
                    <Controller
                      name="unit"
                      control={control}
                      render={({ field }) => (
                        <Form.Item validateStatus={errors.unit ? 'error' : ''} help={errors.unit?.message} style={{ marginBottom: 0 }}>
                          <Select {...field} size="large">
                            {['pcs', 'kg', 'box', 'dus', 'lusin', 'liter', 'meter', 'pack', 'roll'].map(u => (
                              <Option key={u} value={u}>{u}</Option>
                            ))}
                          </Select>
                        </Form.Item>
                      )}
                    />
                  </div>
                </div>

                <Button type="primary" htmlType="submit" icon={<Plus size={16} />} size="large" className="mt-2 w-full bg-blue-600 hover:bg-blue-700">
                  Tambah Barang
                </Button>
              </div>
            </form>
          </Card>
        </Col>

        <Col xs={24} md={16}>
          <Card title="Daftar Belanja" bordered={false} className="shadow-sm" bodyStyle={{ padding: '12px' }}>
            <Table
              dataSource={items}
              columns={columns}
              rowKey="id"
              pagination={false}
              scroll={{ x: 600 }}
              size="middle"
              summary={() => (
                <Table.Summary fixed>
                  <Table.Summary.Row className="bg-gray-50">
                    <Table.Summary.Cell index={0} colSpan={2}><Text strong className="text-base">Total Belanja</Text></Table.Summary.Cell>
                    <Table.Summary.Cell index={1} colSpan={2} align="right">
                      <Text strong className="text-base">Rp {totalShopping.toLocaleString()}</Text>
                    </Table.Summary.Cell>
                  </Table.Summary.Row>
                  <Table.Summary.Row className="bg-gray-50">
                    <Table.Summary.Cell index={0} colSpan={2}><Text strong className="text-base">Sisa Uang</Text></Table.Summary.Cell>
                    <Table.Summary.Cell index={1} colSpan={2} align="right">
                      <Text strong className="text-base" type={remainingMoney < 0 ? 'danger' : 'success'}>
                        Rp {remainingMoney.toLocaleString()}
                      </Text>
                    </Table.Summary.Cell>
                  </Table.Summary.Row>
                </Table.Summary>
              )}
            />
          </Card>
        </Col>
      </Row>

      <Modal
        title="Riwayat Belanja"
        open={historyOpen}
        onCancel={() => setHistoryOpen(false)}
        width={1000}
        footer={null}
        destroyOnHidden
        style={{ top: 20 }}
        styles={{ body: { padding: 0 } }}
        className="full-screen-modal-mobile"
      >
        <ShoppingNoteHistory onLoadNote={loadNote} onClose={() => setHistoryOpen(false)} />
      </Modal>
    </div>
  );
}
