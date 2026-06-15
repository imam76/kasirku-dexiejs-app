import type { ProductionOrder, ProductionOrderCost, ProductionOrderItem } from '@/types';

export const assertProductionOrderDraft = (order: Pick<ProductionOrder, 'status'>) => {
  if (order.status !== 'DRAFT') {
    throw new Error('Produksi hanya bisa diubah atau diposting saat masih draft.');
  }
};

export const assertProductionOrderPosted = (order: Pick<ProductionOrder, 'status'>) => {
  if (order.status !== 'POSTED') {
    throw new Error('Produksi harus sudah posted untuk aksi ini.');
  }
};

export const validateProductionQuantity = (quantity: unknown) => {
  const numeric = Number(quantity);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    throw new Error('Jumlah produksi harus lebih dari 0.');
  }

  return numeric;
};

export const validateProductionItems = (
  items: Array<Pick<ProductionOrderItem, 'material_product_id' | 'material_product_name' | 'quantity_used'>>,
) => {
  if (items.length === 0) {
    throw new Error('Minimal satu bahan baku harus diisi.');
  }

  const materialIds = new Set<string>();
  for (const item of items) {
    if (!item.material_product_id) {
      throw new Error('Produk bahan baku wajib dipilih.');
    }
    if (materialIds.has(item.material_product_id)) {
      throw new Error(`Produk bahan baku duplikat: ${item.material_product_name}.`);
    }

    materialIds.add(item.material_product_id);

    const quantity = Number(item.quantity_used);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new Error(`Jumlah bahan ${item.material_product_name || 'baku'} harus lebih dari 0.`);
    }
  }
};

export const validateProductionCosts = (
  costs: Array<Pick<ProductionOrderCost, 'name' | 'amount'>>,
) => {
  for (const cost of costs) {
    const amount = Number(cost.amount);
    if (!Number.isFinite(amount) || amount < 0) {
      throw new Error('Nominal biaya tambahan tidak boleh negatif.');
    }
    if (amount > 0 && !cost.name.trim()) {
      throw new Error('Nama biaya tambahan wajib diisi.');
    }
  }
};
