import { useState } from 'react';
import { Controller } from 'react-hook-form';
import { Table, Button, InputNumber, Select, Card, Typography, Form, Row, Col, Modal, Tag } from 'antd';
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
    products,
    isProductsLoading,
    removeItem,
    totalShopping,
    control,
    handleSubmit,
    handleProductChange,
    errors,
    saveNote,
  } = useShoppingNote();

  const unitOptions = Array.from(
    new Set(['pcs', 'kg', 'gram', 'ons', 'box', 'dus', 'lusin', 'liter', 'meter', 'pack', 'roll', ...products.map((product) => product.purchase_unit)])
  ).filter(Boolean);

  const columns: ColumnsType<ShoppingNoteItem> = [
    {
      title: 'Produk',
      dataIndex: 'product_name',
      key: 'product_name',
      render: (val: string, record: ShoppingNoteItem) => (
        <div>
          <div className="font-medium">{val || record.name}</div>
          {record.sku && <Tag className="mt-1">{record.sku}</Tag>}
        </div>
      ),
    },
    {
      title: 'Harga Modal',
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
      title: 'Satuan',
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
        <h2 className="min-w-0 text-lg font-bold text-gray-800 sm:text-xl md:text-2xl">Belanja Stok</h2>
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
            Selesaikan
          </Button>
        </div>
      </div>

      <Row gutter={[16, 16]}>
        <Col xs={24} md={8}>
          <Card title="Input Belanja Stok" bordered={false} className="shadow-sm">
            <form onSubmit={handleSubmit}>
              <div className="flex flex-col gap-4">
                <div>
                  <div className="mb-1"><Text strong>Produk</Text></div>
                  <Controller
                    name="product_id"
                    control={control}
                    render={({ field }) => (
                      <Form.Item validateStatus={errors.product_id ? 'error' : ''} help={errors.product_id?.message} style={{ marginBottom: 0 }}>
                        <Select
                          {...field}
                          showSearch
                          loading={isProductsLoading}
                          placeholder="Pilih produk"
                          size="large"
                          optionFilterProp="children"
                          onChange={(value) => {
                            field.onChange(value);
                            handleProductChange(value);
                          }}
                        >
                          {products.map((product) => (
                            <Option key={product.id} value={product.id}>
                              {product.name}{product.sku ? ` (${product.sku})` : ''}
                            </Option>
                          ))}
                        </Select>
                      </Form.Item>
                    )}
                  />
                </div>

                <div>
                  <div className="mb-1"><Text strong>Harga Modal</Text></div>
                  <Controller
                    name="unit_price"
                    control={control}
                    render={({ field }) => (
                      <Form.Item validateStatus={errors.unit_price ? 'error' : ''} help={errors.unit_price?.message} style={{ marginBottom: 0 }}>
                        <InputNumber
                          {...field}
                          style={{ width: '100%' }}
                          placeholder="Harga modal per satuan"
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
                    <div className="mb-1"><Text strong>Satuan</Text></div>
                    <Controller
                      name="unit"
                      control={control}
                      render={({ field }) => (
                        <Form.Item validateStatus={errors.unit ? 'error' : ''} help={errors.unit?.message} style={{ marginBottom: 0 }}>
                          <Select {...field} size="large">
                            {unitOptions.map(u => (
                              <Option key={u} value={u}>{u}</Option>
                            ))}
                          </Select>
                        </Form.Item>
                      )}
                    />
                  </div>
                </div>

                <Button type="primary" htmlType="submit" icon={<Plus size={16} />} size="large" className="mt-2 w-full bg-blue-600 hover:bg-blue-700">
                  Tambah ke Draft
                </Button>
              </div>
            </form>
          </Card>
        </Col>

        <Col xs={24} md={16}>
          <Card title="Draft Belanja Stok" bordered={false} className="shadow-sm" bodyStyle={{ padding: '12px' }}>
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
                    <Table.Summary.Cell index={0} colSpan={3}><Text strong className="text-base">Total Belanja Stok</Text></Table.Summary.Cell>
                    <Table.Summary.Cell index={1} colSpan={3} align="right">
                      <Text strong className="text-base">Rp {totalShopping.toLocaleString()}</Text>
                    </Table.Summary.Cell>
                  </Table.Summary.Row>
                </Table.Summary>
              )}
            />
          </Card>
        </Col>
      </Row>

      <Modal
        title="Riwayat Belanja Stok"
        open={historyOpen}
        onCancel={() => setHistoryOpen(false)}
        width={1000}
        footer={null}
        destroyOnHidden
        style={{ top: 20 }}
        styles={{ body: { padding: 0 } }}
        className="full-screen-modal-mobile"
      >
        <ShoppingNoteHistory />
      </Modal>
    </div>
  );
}
