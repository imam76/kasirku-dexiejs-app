import { useEffect, useMemo, useState } from 'react';
import { App, Button, Card, DatePicker, Form, Input, InputNumber, Modal, Select, Space, Switch, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { Dayjs } from 'dayjs';
import { useQueryClient } from '@tanstack/react-query';
import { useLiveQuery } from 'dexie-react-hooks';
import { BadgePercent, Edit2, Plus, Trash2 } from 'lucide-react';
import { PRODUCT_CATEGORIES } from '@/constants/categories';
import { db } from '@/lib/db';
import dayjs from '@/lib/dayjs';
import { createPromo, deletePromo, updatePromo, type PromoFormInput } from '@/services/promoService';
import type { ProductCategory, Promo, PromoAppliesTo, PromoType } from '@/types';
import { formatCurrency } from '@/utils/formatters';
import { matchesProductSearch } from '@/utils/productSearch';

const { Text } = Typography;

interface PromoFormValues {
  name: string;
  type: PromoType;
  value: number;
  applies_to: PromoAppliesTo;
  product_ids?: string[];
  categories?: ProductCategory[];
  start_at?: Dayjs | null;
  end_at?: Dayjs | null;
  min_qty?: number | null;
  min_total?: number | null;
  voucher_code?: string | null;
  active: boolean;
  priority: number;
}

const promoTypeOptions: Array<{ value: PromoType; label: string }> = [
  { value: 'percent', label: 'Persen' },
  { value: 'fixed', label: 'Nominal' },
];

const appliesToOptions: Array<{ value: PromoAppliesTo; label: string }> = [
  { value: 'all', label: 'Semua produk' },
  { value: 'product', label: 'Produk tertentu' },
  { value: 'category', label: 'Kategori tertentu' },
];

const getScopeLabel = (promo: Promo) => {
  if (promo.applies_to === 'all') return 'Semua produk';
  if (promo.applies_to === 'product') return `${promo.product_ids?.length ?? 0} produk`;
  return `${promo.categories?.length ?? 0} kategori`;
};

const getPromoValueLabel = (promo: Promo) => {
  if (promo.type === 'percent') return `${promo.value}%`;
  return `Rp ${formatCurrency(promo.value)}`;
};

const getPeriodLabel = (promo: Promo) => {
  const start = promo.start_at ? dayjs(promo.start_at).tz().format('DD MMM YYYY HH:mm') : 'Sekarang';
  const end = promo.end_at ? dayjs(promo.end_at).tz().format('DD MMM YYYY HH:mm') : 'Tanpa batas';

  return `${start} - ${end}`;
};

const toPromoFormInput = (values: PromoFormValues): PromoFormInput => ({
  name: values.name,
  type: values.type,
  value: Number(values.value),
  applies_to: values.applies_to,
  product_ids: values.applies_to === 'product' ? values.product_ids ?? [] : [],
  categories: values.applies_to === 'category' ? values.categories ?? [] : [],
  start_at: values.start_at?.toISOString() ?? null,
  end_at: values.end_at?.toISOString() ?? null,
  min_qty: values.min_qty ?? null,
  min_total: values.min_total ?? null,
  voucher_code: values.voucher_code ?? null,
  active: Boolean(values.active),
  priority: Number(values.priority ?? 10),
});

const getPromoFormValues = (promo: Promo): PromoFormValues => ({
  name: promo.name,
  type: promo.type,
  value: promo.value,
  applies_to: promo.applies_to,
  product_ids: [...(promo.product_ids ?? [])],
  categories: [...(promo.categories ?? [])],
  start_at: promo.start_at ? dayjs(promo.start_at) : null,
  end_at: promo.end_at ? dayjs(promo.end_at) : null,
  min_qty: promo.min_qty ?? null,
  min_total: promo.min_total ?? null,
  voucher_code: promo.voucher_code ?? null,
  active: promo.active,
  priority: promo.priority,
});

export default function PromoManagement() {
  const { message, modal } = App.useApp();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<PromoFormValues>();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPromo, setEditingPromo] = useState<Promo | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const appliesTo = Form.useWatch('applies_to', form) ?? 'all';
  const promoType = Form.useWatch('type', form) ?? 'percent';

  const promos = useLiveQuery(
    () => db.promos.orderBy('created_at').reverse().toArray(),
    [],
    [],
  );
  const products = useLiveQuery(
    () => db.products.orderBy('name').toArray(),
    [],
    [],
  );

  const productOptions = products.map((product) => ({
    value: product.id,
    label: product.sku ? `${product.name} (${product.sku})` : product.name,
  }));
  const productsById = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products],
  );
  const categoryOptions = PRODUCT_CATEGORIES.map((category) => ({
    value: category.value,
    label: category.label,
  }));

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingPromo(null);
    form.resetFields();
  };

  const handleAdd = () => {
    setEditingPromo(null);
    setIsModalOpen(true);
  };

  const handleEdit = (promo: Promo) => {
    setEditingPromo(promo);
    setIsModalOpen(true);
  };

  useEffect(() => {
    if (!isModalOpen) return;

    form.resetFields();
    form.setFieldsValue(editingPromo
      ? getPromoFormValues(editingPromo)
      : {
          type: 'percent',
          applies_to: 'all',
          active: true,
          priority: 10,
        });
  }, [editingPromo, form, isModalOpen]);

  const refreshPromoPreview = () => {
    queryClient.invalidateQueries({ queryKey: ['activePromos'] });
  };

  const handleSubmit = async (values: PromoFormValues) => {
    try {
      setIsSubmitting(true);
      const input = toPromoFormInput(values);

      if (editingPromo) {
        await updatePromo(editingPromo.id, input);
        message.success('Promo berhasil diperbarui.');
      } else {
        await createPromo(input);
        message.success('Promo berhasil ditambahkan.');
      }

      refreshPromoPreview();
      closeModal();
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Gagal menyimpan promo.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = (promo: Promo) => {
    modal.confirm({
      title: 'Hapus promo?',
      content: `Promo "${promo.name}" akan dihapus. Transaksi lama tetap aman karena menyimpan snapshot promo.`,
      okText: 'Hapus',
      okType: 'danger',
      cancelText: 'Batal',
      onOk: async () => {
        try {
          await deletePromo(promo.id);
          refreshPromoPreview();
          message.success('Promo berhasil dihapus.');
        } catch (error) {
          message.error(error instanceof Error ? error.message : 'Gagal menghapus promo.');
        }
      },
    });
  };

  const columns: ColumnsType<Promo> = [
    {
      title: 'Promo',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, promo) => (
        <Space orientation="vertical" size={0}>
          <Text strong>{name}</Text>
          {promo.voucher_code && <Text type="secondary">Voucher: {promo.voucher_code}</Text>}
        </Space>
      ),
    },
    {
      title: 'Nilai',
      key: 'value',
      render: (_value: unknown, promo) => (
        <Tag color={promo.type === 'percent' ? 'green' : 'blue'}>
          {getPromoValueLabel(promo)}
        </Tag>
      ),
    },
    {
      title: 'Berlaku',
      key: 'scope',
      render: (_value: unknown, promo) => getScopeLabel(promo),
    },
    {
      title: 'Periode',
      key: 'period',
      render: (_value: unknown, promo) => (
        <span className="text-xs text-gray-600">{getPeriodLabel(promo)}</span>
      ),
    },
    {
      title: 'Syarat',
      key: 'requirements',
      render: (_value: unknown, promo) => (
        <Space orientation="vertical" size={0}>
          <Text type="secondary">Qty: {promo.min_qty ?? '-'}</Text>
          <Text type="secondary">Total: {promo.min_total ? `Rp ${formatCurrency(promo.min_total)}` : '-'}</Text>
        </Space>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'active',
      key: 'active',
      render: (active: boolean) => active ? <Tag color="green">Aktif</Tag> : <Tag>Nonaktif</Tag>,
    },
    {
      title: 'Priority',
      dataIndex: 'priority',
      key: 'priority',
      align: 'right',
    },
    {
      title: 'Aksi',
      key: 'action',
      render: (_value: unknown, promo) => (
        <Space wrap>
          <Button type="text" icon={<Edit2 size={16} />} onClick={() => handleEdit(promo)}>
            Edit
          </Button>
          <Button danger type="text" icon={<Trash2 size={16} />} onClick={() => handleDelete(promo)}>
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
          <BadgePercent className="h-5 w-5" />
          Promo dan Diskon
        </div>
      )}
      extra={(
        <Button type="primary" icon={<Plus size={16} />} onClick={handleAdd}>
          Tambah Promo
        </Button>
      )}
    >
      <Table
        dataSource={promos}
        columns={columns}
        rowKey="id"
        pagination={{ pageSize: 6 }}
        scroll={{ x: true }}
      />

      <Modal
        title={editingPromo ? 'Edit Promo' : 'Tambah Promo'}
        open={isModalOpen}
        onCancel={closeModal}
        onOk={() => form.submit()}
        confirmLoading={isSubmitting}
        destroyOnHidden
        forceRender
        width={720}
      >
        <Form<PromoFormValues>
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          requiredMark={false}
          className="mt-4"
        >
          <Form.Item
            name="name"
            label="Nama Promo"
            rules={[{ required: true, message: 'Nama promo wajib diisi.' }]}
          >
            <Input placeholder="Contoh: Diskon 10% Semua Produk" />
          </Form.Item>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Form.Item name="type" label="Tipe" rules={[{ required: true }]}>
              <Select options={promoTypeOptions} />
            </Form.Item>
            <Form.Item
              name="value"
              label={promoType === 'percent' ? 'Nilai (%)' : 'Nilai Rupiah'}
              rules={[{ required: true, message: 'Nilai promo wajib diisi.' }]}
            >
              <InputNumber min={1} max={promoType === 'percent' ? 100 : undefined} className="w-full" />
            </Form.Item>
            <Form.Item name="priority" label="Priority" rules={[{ required: true }]}>
              <InputNumber className="w-full" />
            </Form.Item>
          </div>

          <Form.Item name="applies_to" label="Berlaku Untuk" rules={[{ required: true }]}>
            <Select options={appliesToOptions} />
          </Form.Item>

          {appliesTo === 'product' && (
            <Form.Item
              name="product_ids"
              label="Produk"
              rules={[{ required: true, message: 'Pilih minimal satu produk.' }]}
            >
              <Select
                mode="multiple"
                showSearch
                options={productOptions}
                maxTagCount="responsive"
                placeholder="Cari nama atau SKU produk"
                filterOption={(input, option) => {
                  const product = productsById.get(String(option?.value ?? ''));
                  return Boolean(product && matchesProductSearch(product, input));
                }}
              />
            </Form.Item>
          )}

          {appliesTo === 'category' && (
            <Form.Item
              name="categories"
              label="Kategori"
              rules={[{ required: true, message: 'Pilih minimal satu kategori.' }]}
            >
              <Select mode="multiple" options={categoryOptions} maxTagCount="responsive" />
            </Form.Item>
          )}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Form.Item name="start_at" label="Mulai">
              <DatePicker showTime className="w-full" />
            </Form.Item>
            <Form.Item name="end_at" label="Selesai">
              <DatePicker showTime className="w-full" />
            </Form.Item>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Form.Item name="min_qty" label="Minimal Qty">
              <InputNumber min={1} className="w-full" />
            </Form.Item>
            <Form.Item name="min_total" label="Minimal Total">
              <InputNumber min={1} className="w-full" prefix="Rp" />
            </Form.Item>
            <Form.Item name="voucher_code" label="Kode Voucher">
              <Input placeholder="Opsional" />
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
