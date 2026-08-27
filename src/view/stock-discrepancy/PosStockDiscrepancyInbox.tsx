import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { App, Button, Card, Descriptions, Empty, Form, Input, Modal, Select, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from '@/lib/dayjs';
import type { PosStockDiscrepancy, PosStockDiscrepancyStatus } from '@/types';
import { listPosStockDiscrepancies, reviewPosStockDiscrepancy } from '@/services/posStockDiscrepancyService';
import { refreshPosStockDiscrepanciesFromPostgres } from '@/services/posStockDiscrepancyReadService';

const { Text, Title } = Typography;

interface ReviewFormValues {
  status: Extract<PosStockDiscrepancyStatus, 'REVIEWED' | 'NEEDS_INVESTIGATION'>;
  investigation_cause?: string;
  investigation_note?: string;
  stock_opname_id?: string;
}

const statusColor: Record<PosStockDiscrepancyStatus, string> = {
  PENDING_REVIEW: 'gold',
  REVIEWED: 'green',
  NEEDS_INVESTIGATION: 'red',
};

const statusLabel: Record<PosStockDiscrepancyStatus, string> = {
  PENDING_REVIEW: 'Menunggu Review',
  REVIEWED: 'Selesai Direview',
  NEEDS_INVESTIGATION: 'Perlu Investigasi',
};

export default function PosStockDiscrepancyInbox() {
  const { message } = App.useApp();
  const [form] = Form.useForm<ReviewFormValues>();
  const [status, setStatus] = useState<PosStockDiscrepancyStatus | 'ALL'>('PENDING_REVIEW');
  const [selected, setSelected] = useState<PosStockDiscrepancy>();
  const [saving, setSaving] = useState(false);
  const rows = useLiveQuery(() => listPosStockDiscrepancies({ status }), [status], []);

  useEffect(() => {
    void refreshPosStockDiscrepanciesFromPostgres().catch((error) => {
      console.error('Gagal menyegarkan kasus selisih stok POS.', error);
    });
  }, []);

  const columns = useMemo<ColumnsType<PosStockDiscrepancy>>(() => [
    {
      title: 'Waktu',
      dataIndex: 'created_at',
      width: 155,
      render: (value: string) => dayjs(value).format('DD/MM/YYYY HH:mm'),
    },
    {
      title: 'Produk',
      render: (_, row) => (
        <div>
          <div className="font-medium">{row.product_name}</div>
          <Text type="secondary">{row.sku || '-'}</Text>
        </div>
      ),
    },
    {
      title: 'Stok → Jual',
      render: (_, row) => `${row.system_quantity_snapshot} → ${row.requested_quantity} ${row.stock_unit}`,
    },
    {
      title: 'Adjustment',
      dataIndex: 'shortage_quantity',
      render: (value: number, row) => `+${value} ${row.stock_unit}`,
    },
    {
      title: 'Kasir',
      dataIndex: 'cashier_user_name',
      render: (value?: string) => value || '-',
    },
    {
      title: 'Status',
      dataIndex: 'status',
      render: (value: PosStockDiscrepancyStatus) => <Tag color={statusColor[value]}>{statusLabel[value]}</Tag>,
    },
    {
      title: '',
      fixed: 'right',
      width: 100,
      render: (_, row) => <Button size="small" onClick={() => {
        setSelected(row);
        form.setFieldsValue({
          status: row.status === 'REVIEWED' ? 'REVIEWED' : 'NEEDS_INVESTIGATION',
          investigation_cause: row.investigation_cause,
          investigation_note: row.investigation_note,
          stock_opname_id: row.stock_opname_id,
        });
      }}>Review</Button>,
    },
  ], [form]);

  const submitReview = async (values: ReviewFormValues) => {
    if (!selected) return;
    setSaving(true);
    try {
      await reviewPosStockDiscrepancy({ id: selected.id, ...values });
      message.success('Hasil review tersimpan.');
      setSelected(undefined);
      form.resetFields();
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Review gagal disimpan.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-3 sm:p-6">
      <div className="mb-5">
        <Title level={3} className="!mb-1">Review Selisih Stok POS</Title>
        <Text type="secondary">Kasus barang fisik yang ditemukan kasir saat stok sistem tidak mencukupi.</Text>
      </div>
      <Card>
        <Space className="mb-4" wrap>
          <Text strong>Status</Text>
          <Select
            value={status}
            onChange={setStatus}
            className="min-w-48"
            options={[
              { value: 'PENDING_REVIEW', label: 'Menunggu Review' },
              { value: 'NEEDS_INVESTIGATION', label: 'Perlu Investigasi' },
              { value: 'REVIEWED', label: 'Selesai Direview' },
              { value: 'ALL', label: 'Semua' },
            ]}
          />
        </Space>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={rows}
          scroll={{ x: 900 }}
          locale={{ emptyText: <Empty description="Belum ada kasus pada filter ini." /> }}
        />
      </Card>

      <Modal
        title="Review kasus selisih stok"
        open={Boolean(selected)}
        onCancel={() => setSelected(undefined)}
        onOk={() => form.submit()}
        okText="Simpan Review"
        confirmLoading={saving}
        destroyOnHidden
      >
        {selected && (
          <Descriptions size="small" column={1} className="mb-4" bordered>
            <Descriptions.Item label="Transaksi">{selected.transaction_number}</Descriptions.Item>
            <Descriptions.Item label="Produk">{selected.product_name}</Descriptions.Item>
            <Descriptions.Item label="Selisih">+{selected.shortage_quantity} {selected.stock_unit}</Descriptions.Item>
            <Descriptions.Item label="Kasir">{selected.cashier_user_name || '-'}</Descriptions.Item>
          </Descriptions>
        )}
        <Form form={form} layout="vertical" onFinish={submitReview}>
          <Form.Item name="status" label="Hasil review" rules={[{ required: true }]}>
            <Select options={[
              { value: 'REVIEWED', label: 'Selesai direview' },
              { value: 'NEEDS_INVESTIGATION', label: 'Perlu investigasi/cycle count' },
            ]} />
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(before, after) => before.status !== after.status}>
            {({ getFieldValue }) => (
              <Form.Item
                name="investigation_cause"
                label="Hasil/penyebab investigasi"
                rules={getFieldValue('status') === 'REVIEWED' ? [{ required: true }] : []}
              >
                <Input placeholder="Contoh: penerimaan sebelumnya belum tercatat" />
              </Form.Item>
            )}
          </Form.Item>
          <Form.Item name="investigation_note" label="Catatan supervisor">
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item name="stock_opname_id" label="ID Stock Opname/cycle count (opsional)">
            <Input />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
