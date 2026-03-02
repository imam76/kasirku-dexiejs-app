import { Controller } from 'react-hook-form';
import { Table, Button, Input, InputNumber, Select, Card, Typography, Form, Row, Col } from 'antd';
import { Plus, Trash2 } from 'lucide-react';
import { useShoppingNote } from '@/hooks/useShoppingNote';
import { ShoppingNoteItem } from '@/types';

const { Text } = Typography;
const { Option } = Select;

export default function ShoppingNote() {
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
  } = useShoppingNote();

  const columns = [
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
      responsive: ['md'] as const,
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
      responsive: ['md'] as const,
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
    <div className="p-3 sm:p-4 md:p-6">
      <div className="mb-4 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="min-w-0 text-lg font-bold text-gray-800 sm:text-xl md:text-2xl">Catatan Belanja</h2>
      </div>

      <Row gutter={[16, 16]}>
        <Col xs={24} md={8}>
          <Card title="Input Barang" bordered={false}>
            <div className="mb-4">
              <Text strong className="mb-1 block">Uang Dibawa:</Text>
              <InputNumber
                style={{ width: '100%' }}
                value={moneyCarried}
                onChange={(val) => setMoneyCarried(val || 0)}
                formatter={(value) => `Rp ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                parser={(value) => value?.replace(/Rp\s?|(,*)/g, '') as unknown as number}
                placeholder="Masukkan jumlah uang"
              />
            </div>

            <form onSubmit={handleSubmit}>
              <div className="flex flex-col gap-4">
                <div>
                  <div className="mb-1"><Text strong>Nama Barang</Text></div>
                  <Controller
                    name="name"
                    control={control}
                    rules={{ required: 'Nama barang wajib diisi' }}
                    render={({ field }) => (
                      <Form.Item validateStatus={errors.name ? 'error' : ''} help={errors.name?.message} style={{ marginBottom: 0 }}>
                        <Input {...field} placeholder="Nama Barang" />
                      </Form.Item>
                    )}
                  />
                </div>

                <div>
                  <div className="mb-1"><Text strong>Harga Satuan</Text></div>
                  <Controller
                    name="unit_price"
                    control={control}
                    rules={{ required: 'Harga satuan wajib diisi', min: { value: 0, message: 'Harga tidak boleh negatif' } }}
                    render={({ field }) => (
                      <Form.Item validateStatus={errors.unit_price ? 'error' : ''} help={errors.unit_price?.message} style={{ marginBottom: 0 }}>
                        <InputNumber
                          {...field}
                          style={{ width: '100%' }}
                          placeholder="Harga Satuan"
                          formatter={(value) => `Rp ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                          parser={(value) => value?.replace(/Rp\s?|(,*)/g, '') as unknown as number}
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
                      rules={{ required: 'Jumlah wajib diisi', min: { value: 1, message: 'Minimal 1' } }}
                      render={({ field }) => (
                        <Form.Item validateStatus={errors.quantity ? 'error' : ''} help={errors.quantity?.message} style={{ marginBottom: 0 }}>
                          <InputNumber {...field} style={{ width: '100%' }} placeholder="Qty" min={1} />
                        </Form.Item>
                      )}
                    />
                  </div>

                  <div style={{ width: 100 }}>
                    <div className="mb-1"><Text strong>Unit</Text></div>
                    <Controller
                      name="unit"
                      control={control}
                      rules={{ required: true }}
                      render={({ field }) => (
                        <Form.Item style={{ marginBottom: 0 }}>
                          <Select {...field}>
                            {['pcs', 'kg', 'box', 'dus', 'lusin', 'liter', 'meter', 'pack', 'roll'].map(u => (
                              <Option key={u} value={u}>{u}</Option>
                            ))}
                          </Select>
                        </Form.Item>
                      )}
                    />
                  </div>
                </div>

                <Button type="primary" htmlType="submit" icon={<Plus size={16} />} className="mt-2 bg-blue-600 hover:bg-blue-700">
                  Tambah
                </Button>
              </div>
            </form>
          </Card>
        </Col>

        <Col xs={24} md={16}>
          <Card title="Daftar Belanja" bordered={false}>
            <Table
              dataSource={items}
              columns={columns}
              rowKey="id"
              pagination={false}
              scroll={{ x: 'max-content' }}
              summary={() => (
                <Table.Summary fixed>
                  <Table.Summary.Row>
                    <Table.Summary.Cell index={0} colSpan={2}><Text strong>Total Belanja</Text></Table.Summary.Cell>
                    <Table.Summary.Cell index={1} colSpan={2}>
                      <Text strong>Rp {totalShopping.toLocaleString()}</Text>
                    </Table.Summary.Cell>
                  </Table.Summary.Row>
                  <Table.Summary.Row>
                    <Table.Summary.Cell index={0} colSpan={2}><Text strong>Sisa Uang</Text></Table.Summary.Cell>
                    <Table.Summary.Cell index={1} colSpan={2}>
                      <Text strong type={remainingMoney < 0 ? 'danger' : 'success'}>
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
    </div>
  );
}
