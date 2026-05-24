import type { Product, SalesDocument, SalesDocumentItem } from '@/types';
import type { SalesDocumentConfig } from '@/configs/sales-document';
import { konversiSatuanProduk } from '@/utils/pricing';

interface ValidateSalesDocumentInput {
  document: Partial<SalesDocument>;
  items: SalesDocumentItem[];
  config: SalesDocumentConfig;
  products?: Product[];
}

export const validateSalesDocument = ({
  document,
  items,
  config,
  products = [],
}: ValidateSalesDocumentInput) => {
  for (const field of config.requiredFields) {
    const value = document[field as keyof SalesDocument];
    if (value === undefined || value === null || value === '') {
      throw new Error(`Field ${field} wajib diisi.`);
    }
  }

  if (!document.customer_name?.trim()) {
    throw new Error('Nama customer wajib diisi.');
  }

  if (items.length < 1) {
    throw new Error('Minimal tambah 1 item dokumen.');
  }

  for (const item of items) {
    const quantity = config.type === 'SALES_DELIVERY'
      ? Number(item.delivered_quantity ?? item.quantity)
      : Number(item.quantity);

    if (!item.product_id || !item.product_name) {
      throw new Error('Produk item belum lengkap.');
    }

    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new Error(`Qty ${item.product_name} harus lebih dari 0.`);
    }

    if (config.behavior.hasPricing && (!Number.isFinite(Number(item.price)) || Number(item.price) < 0)) {
      throw new Error(`Harga ${item.product_name} tidak valid.`);
    }

    if (
      config.type === 'SALES_DELIVERY' &&
      item.ordered_quantity !== undefined &&
      Number(item.delivered_quantity ?? item.quantity) > Number(item.ordered_quantity)
    ) {
      throw new Error(`Qty kirim ${item.product_name} tidak boleh melebihi qty order.`);
    }

    if (config.behavior.validateStock) {
      const product = products.find((candidate) => candidate.id === item.product_id);
      if (!product) {
        throw new Error(`Produk ${item.product_name} tidak ditemukan.`);
      }

      const quantityInStockUnit = konversiSatuanProduk(quantity, product, item.unit, product.purchase_unit);
      if (quantityInStockUnit > product.stock) {
        throw new Error(`Stok ${item.product_name} tidak cukup.`);
      }
    }
  }

  if (document.tax_id && (!document.tax_name || document.tax_rate === undefined || !document.tax_calculation_mode)) {
    throw new Error('Snapshot pajak belum lengkap.');
  }

  if (config.type === 'SALES_INVOICE' && !document.payment_status) {
    throw new Error('Status bayar invoice wajib diisi.');
  }
};
