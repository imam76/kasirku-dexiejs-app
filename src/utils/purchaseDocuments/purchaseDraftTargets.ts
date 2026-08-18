import type { PurchaseDocumentType } from '@/types';

/** Dokumen yang boleh lahir dari daftar produk terpilih. */
export const PURCHASE_DRAFT_TARGET_TYPES: PurchaseDocumentType[] = [
  'PURCHASE_REQUEST',
  'REQUEST_FOR_QUOTATION',
  'PURCHASE_ORDER',
  'PURCHASE_INVOICE',
];
