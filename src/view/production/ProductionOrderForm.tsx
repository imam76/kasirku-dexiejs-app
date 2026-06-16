import { useMemo, useState } from 'react';
import { App, Button, Card, DatePicker, Input, InputNumber, Select, Space, Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, Plus, Save, Send, Trash2 } from 'lucide-react';
import { db } from '@/lib/db';
import dayjs from '@/lib/dayjs';
import { useProductionOrders } from '@/hooks/useProductionOrders';
import { useUnits } from '@/hooks/useUnits';
import { formatCurrency } from '@/utils/formatters';
import { konversiSatuanProduk } from '@/utils/pricing';
import {
  ProductionMaterialRowsVirtualTable,
  type ProductionMaterialDraftRow,
  type ProductionMaterialPreviewRow,
} from './ProductionMaterialRowsVirtualTable';

interface ProductionOrderFormProps {
  onBack: () => void;
  onSaved: (productionOrderId: string) => void;
  onPosted: (productionOrderId: string) => void;
}

interface CostDraftRow {
  id: string;
  name: string;
  amount: number;
}

const { Title, Text } = Typography;

const createMaterialRow = (): ProductionMaterialDraftRow => ({
  id: crypto.randomUUID(),
  quantity: 1,
});

const createCostRow = (): CostDraftRow => ({
  id: crypto.randomUUID(),
  name: '',
  amount: 0,
});

const formatMoney = (value: number) => `Rp ${formatCurrency(Math.round(value || 0))}`;

export default function ProductionOrderForm({ onBack, onSaved, onPosted }: ProductionOrderFormProps) {
  const { message } = App.useApp();
  const { unitOptions } = useUnits();
  const liveProducts = useLiveQuery(() => db.products.orderBy('name').toArray(), [], []);
  const products = useMemo(() => liveProducts ?? [], [liveProducts]);
  const { createDraft, postDraft, isCreatingDraft, isPostingDraft } = useProductionOrders();
  const [finishedProductId, setFinishedProductId] = useState<string>();
  const [quantityProduced, setQuantityProduced] = useState<number | null>(1);
  const [producedAt, setProducedAt] = useState(dayjs());
  const [notes, setNotes] = useState('');
  const [materials, setMaterials] = useState<ProductionMaterialDraftRow[]>([createMaterialRow()]);
  const [costs, setCosts] = useState<CostDraftRow[]>([]);
  const [materialScrollToLastRequest, setMaterialScrollToLastRequest] = useState(0);

  const productById = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
  const finishedProduct = finishedProductId ? productById.get(finishedProductId) : undefined;
  const productOptions = useMemo(() => products.map((product) => ({
    value: product.id,
    label: `${product.name}${product.sku ? ` (${product.sku})` : ''}`,
  })), [products]);

  const materialPreviewRows = useMemo<ProductionMaterialPreviewRow[]>(() => materials.map((row) => {
    const product = row.productId ? productById.get(row.productId) : undefined;
    const unit = row.unit ?? product?.purchase_unit ?? 'pcs';
    const quantity = Number(row.quantity || 0);
    const stockQuantity = product
      ? konversiSatuanProduk(quantity, product, unit, product.purchase_unit)
      : 0;
    const estimatedCost = product ? stockQuantity * Number(product.purchase_price || 0) : 0;

    return {
      ...row,
      product,
      unit,
      stockQuantity,
      estimatedCost,
    };
  }), [materials, productById]);

  const materialCost = materialPreviewRows.reduce((sum, row) => sum + row.estimatedCost, 0);
  const additionalCost = costs.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const totalCost = materialCost + additionalCost;
  const unitCost = Number(quantityProduced || 0) > 0 ? totalCost / Number(quantityProduced || 1) : 0;

  const updateMaterial = (id: string, patch: Partial<ProductionMaterialDraftRow>) => {
    setMaterials((current) => current.map((row) => {
      if (row.id !== id) return row;
      const next = { ...row, ...patch };
      if (patch.productId) {
        const product = productById.get(patch.productId);
        next.unit = product?.purchase_unit ?? next.unit;
      }
      return next;
    }));
  };

  const addMaterial = () => {
    setMaterials((current) => [...current, createMaterialRow()]);
    setMaterialScrollToLastRequest((current) => current + 1);
  };

  const removeMaterial = (id: string) => {
    setMaterials((current) => (
      current.length === 1
        ? current
        : current.filter((item) => item.id !== id)
    ));
  };

  const updateCost = (id: string, patch: Partial<CostDraftRow>) => {
    setCosts((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };

  const buildInput = () => ({
    finishedProductId: finishedProductId ?? '',
    quantityProduced: Number(quantityProduced || 0),
    producedAt: producedAt.toISOString(),
    notes,
    materials: materials.map((row) => ({
      productId: row.productId ?? '',
      quantity: Number(row.quantity || 0),
      unit: row.unit ?? productById.get(row.productId ?? '')?.purchase_unit ?? 'pcs',
    })),
    additionalCosts: costs
      .filter((row) => row.name.trim() || Number(row.amount || 0) > 0)
      .map((row) => ({
        name: row.name,
        amount: Number(row.amount || 0),
      })),
  });

  const handleSaveDraft = async () => {
    try {
      const result = await createDraft(buildInput());
      onSaved(result.order.id);
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Gagal menyimpan draft produksi.');
    }
  };

  const handlePost = async () => {
    try {
      const draft = await createDraft(buildInput());
      const posted = await postDraft({ productionOrderId: draft.order.id });
      onPosted(posted.order.id);
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Gagal posting produksi.');
    }
  };

  const costColumns: ColumnsType<CostDraftRow> = [
    {
      title: 'Nama biaya',
      dataIndex: 'name',
      render: (_value, row) => (
        <Input
          value={row.name}
          placeholder="Contoh: Tenaga kerja"
          onChange={(event) => updateCost(row.id, { name: event.target.value })}
        />
      ),
    },
    {
      title: 'Nominal',
      dataIndex: 'amount',
      width: 180,
      render: (_value, row) => (
        <InputNumber
          min={0}
          className="w-full"
          prefix="Rp"
          value={row.amount}
          onChange={(value) => updateCost(row.id, { amount: Number(value || 0) })}
        />
      ),
    },
    {
      title: '',
      key: 'action',
      width: 64,
      render: (_value, row) => (
        <Button
          type="text"
          danger
          aria-label="Hapus biaya"
          icon={<Trash2 size={16} />}
          onClick={() => setCosts((current) => current.filter((item) => item.id !== row.id))}
        />
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Space>
          <Button icon={<ArrowLeft size={16} />} onClick={onBack}>
            Kembali
          </Button>
          <Title level={4} className="!mb-0">Produksi Baru</Title>
        </Space>
        <Space wrap>
          <Button icon={<Save size={16} />} loading={isCreatingDraft} onClick={handleSaveDraft}>
            Simpan Draft
          </Button>
          <Button type="primary" icon={<Send size={16} />} loading={isCreatingDraft || isPostingDraft} onClick={handlePost}>
            Posting Produksi
          </Button>
        </Space>
      </div>

      <Card className="rounded-md shadow-md">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
          <div className="lg:col-span-2">
            <Text className="mb-1 block text-sm font-medium">Barang jadi</Text>
            <Select
              showSearch
              className="w-full"
              value={finishedProductId}
              placeholder="Pilih produk barang jadi"
              options={productOptions}
              optionFilterProp="label"
              onChange={setFinishedProductId}
            />
          </div>
          <div>
            <Text className="mb-1 block text-sm font-medium">Jumlah produksi</Text>
            <InputNumber min={0} className="w-full" value={quantityProduced} onChange={setQuantityProduced} />
          </div>
          <div>
            <Text className="mb-1 block text-sm font-medium">Satuan</Text>
            <Input disabled value={finishedProduct?.purchase_unit ?? '-'} />
          </div>
          <div className="lg:col-span-2">
            <Text className="mb-1 block text-sm font-medium">Tanggal produksi</Text>
            <DatePicker showTime className="w-full" value={producedAt} onChange={(value) => value && setProducedAt(value)} />
          </div>
          <div className="lg:col-span-2">
            <Text className="mb-1 block text-sm font-medium">Catatan</Text>
            <Input value={notes} onChange={(event) => setNotes(event.target.value)} />
          </div>
        </div>
      </Card>

      <Card
        className="rounded-md shadow-md"
        title="Bahan Baku"
        extra={(
          <Button icon={<Plus size={16} />} onClick={addMaterial}>
            Tambah Bahan
          </Button>
        )}
      >
        <ProductionMaterialRowsVirtualTable
          rows={materialPreviewRows}
          productOptions={productOptions}
          unitOptions={unitOptions}
          scrollToLastRequest={materialScrollToLastRequest}
          onUpdateMaterial={updateMaterial}
          onRemoveMaterial={removeMaterial}
        />
      </Card>

      <Card
        className="rounded-md shadow-md"
        title="Biaya Tambahan"
        extra={(
          <Button icon={<Plus size={16} />} onClick={() => setCosts((current) => [...current, createCostRow()])}>
            Tambah Biaya
          </Button>
        )}
      >
        <Table
          rowKey="id"
          columns={costColumns}
          dataSource={costs}
          pagination={false}
          locale={{ emptyText: 'Belum ada biaya tambahan' }}
          scroll={{ x: 640 }}
        />
      </Card>

      <Card className="rounded-md shadow-md">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <div>
            <Text type="secondary">Total bahan</Text>
            <div className="text-base font-semibold">{formatMoney(materialCost)}</div>
          </div>
          <div>
            <Text type="secondary">Biaya tambahan</Text>
            <div className="text-base font-semibold">{formatMoney(additionalCost)}</div>
          </div>
          <div>
            <Text type="secondary">Total produksi</Text>
            <div className="text-base font-semibold">{formatMoney(totalCost)}</div>
          </div>
          <div>
            <Text type="secondary">HPP per unit</Text>
            <div className="text-base font-semibold">{formatMoney(unitCost)}</div>
          </div>
        </div>
      </Card>
    </div>
  );
}
