import type { Product, StockOpname, StockOpnameItem } from '@/types';

export const assertStockOpnameDraft = (opname: Pick<StockOpname, 'status'>) => {
  if (opname.status !== 'DRAFT') {
    throw new Error('Stock opname hanya bisa diubah saat masih draft.');
  }
};

export const validateCountedQuantity = (countedQuantity: unknown) => {
  if (countedQuantity === undefined || countedQuantity === null || countedQuantity === '') {
    return;
  }

  const numeric = Number(countedQuantity);
  if (!Number.isFinite(numeric) || numeric < 0) {
    throw new Error('Stok fisik harus berupa angka valid dan tidak boleh negatif.');
  }
};

export const validateStockOpnameItemsForPost = (
  items: StockOpnameItem[],
  productsById?: Map<string, Pick<Product, 'id' | 'purchase_unit' | 'name'>>,
) => {
  const productIds = new Set<string>();
  let countedItemCount = 0;

  for (const item of items) {
    if (productIds.has(item.product_id)) {
      throw new Error(`Produk duplikat pada opname: ${item.product_name}.`);
    }
    productIds.add(item.product_id);

    validateCountedQuantity(item.counted_quantity);
    if (item.counted_quantity !== undefined && item.counted_quantity !== null) {
      countedItemCount += 1;
    }

    const product = productsById?.get(item.product_id);
    if (product && item.unit !== product.purchase_unit) {
      throw new Error(`Unit item ${item.product_name} tidak sama dengan unit beli produk.`);
    }
  }

  if (countedItemCount === 0) {
    throw new Error('Minimal satu produk harus memiliki stok fisik sebelum posting.');
  }
};
