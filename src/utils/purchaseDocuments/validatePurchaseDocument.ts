import type { Product, PurchaseDocument, PurchaseDocumentItem, PurchaseDocumentType } from '@/types';
import type { PurchaseDocumentConfig } from '@/configs/purchase-document';

interface ValidatePurchaseDocumentInput {
  document: Partial<PurchaseDocument>;
  items: PurchaseDocumentItem[];
  config: PurchaseDocumentConfig;
  products?: Product[];
  mode?: 'draft' | 'issue';
}

const supplierRequiredOnIssue = new Set<PurchaseDocumentType>([
  'REQUEST_FOR_QUOTATION',
  'PURCHASE_ORDER',
  'PURCHASE_RECEIPT',
  'PURCHASE_INVOICE',
]);

export const validatePurchaseDocument = ({
  document,
  items,
  config,
  products = [],
  mode = 'draft',
}: ValidatePurchaseDocumentInput) => {
  for (const field of config.requiredFields) {
    const value = document[field as keyof PurchaseDocument];
    if (value === undefined || value === null || value === '') {
      throw new Error(`Field ${field} wajib diisi.`);
    }
  }

  if (mode === 'issue' && supplierRequiredOnIssue.has(config.type) && !document.supplier_name?.trim()) {
    throw new Error('Supplier wajib diisi sebelum dokumen diterbitkan.');
  }

  if (items.length < 1) {
    throw new Error('Minimal tambah 1 item dokumen.');
  }

  for (const item of items) {
    const quantity = Number(item.quantity || 0);
    const receivedQuantity = config.type === 'PURCHASE_RECEIPT'
      ? Number(item.received_quantity ?? item.quantity)
      : quantity;

    if (!item.product_id || !item.product_name) {
      throw new Error('Produk item belum lengkap.');
    }

    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new Error(`Qty ${item.product_name} harus lebih dari 0.`);
    }

    if (config.type === 'PURCHASE_RECEIPT' && (!Number.isFinite(receivedQuantity) || receivedQuantity <= 0)) {
      throw new Error(`Qty terima ${item.product_name} harus lebih dari 0.`);
    }

    if (config.behavior.hasPricing && (!Number.isFinite(Number(item.price)) || Number(item.price) < 0)) {
      throw new Error(`Harga ${item.product_name} tidak valid.`);
    }

    if (config.behavior.hasTax && document.tax_id) {
      if (!Number.isFinite(Number(item.tax_rate)) || Number(item.tax_rate) < 0) {
        throw new Error(`Rate pajak ${item.product_name} tidak valid.`);
      }

      if (!Number.isFinite(Number(item.tax_amount)) || Number(item.tax_amount) < 0) {
        throw new Error(`Nilai pajak ${item.product_name} tidak valid.`);
      }
    }

    if (products.length > 0 && !products.some((product) => product.id === item.product_id)) {
      throw new Error(`Produk ${item.product_name} tidak ditemukan.`);
    }
  }

  if (document.tax_id && (!document.tax_name || document.tax_rate === undefined || !document.tax_calculation_mode)) {
    throw new Error('Snapshot pajak belum lengkap.');
  }

  if (config.behavior.hasPaymentStatus && !document.payment_status) {
    throw new Error('Status bayar invoice wajib diisi.');
  }
};
