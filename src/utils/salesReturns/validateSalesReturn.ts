import type {
  SalesReturnLimitSnapshot,
  SalesDocumentStatus,
  SalesReturn,
  SalesReturnItem,
  SalesReturnSourceType,
  TransactionStatus,
} from '@/types';

interface ValidateSalesReturnInput {
  salesReturn: Partial<SalesReturn>;
  items: SalesReturnItem[];
  sourceStatus?: SalesDocumentStatus | TransactionStatus;
  remainingQuantityBySourceItemId: Record<string, number>;
  limits?: SalesReturnLimitSnapshot;
}

const isReturnableSourceStatus = (
  sourceType: SalesReturnSourceType | undefined,
  sourceStatus: SalesDocumentStatus | TransactionStatus | undefined,
) => {
  if (sourceType === 'SALES_DELIVERY' || sourceType === 'SALES_INVOICE') {
    return sourceStatus === 'ISSUED';
  }

  if (sourceType === 'POS_TRANSACTION') {
    return sourceStatus !== 'VOIDED';
  }

  return false;
};

export const validateSalesReturn = ({
  salesReturn,
  items,
  sourceStatus,
  remainingQuantityBySourceItemId,
  limits,
}: ValidateSalesReturnInput) => {
  if (!salesReturn.source_type || !salesReturn.source_id) {
    throw new Error('Source retur wajib dipilih.');
  }

  if (!isReturnableSourceStatus(salesReturn.source_type, sourceStatus)) {
    throw new Error('Source belum boleh diretur atau sudah dibatalkan.');
  }

  if (items.length === 0) {
    throw new Error('Minimal satu item retur wajib diisi.');
  }

  for (const item of items) {
    if (!item.source_item_id) {
      throw new Error('Item retur harus berasal dari item source.');
    }

    if (Number(item.quantity || 0) <= 0) {
      throw new Error(`${item.product_name || 'Item'} harus memiliki qty retur lebih dari 0.`);
    }

    const remainingQuantity = Number(remainingQuantityBySourceItemId[item.source_item_id] ?? 0);
    if (Number(item.quantity || 0) > remainingQuantity) {
      throw new Error(`${item.product_name} melebihi sisa qty yang bisa diretur (${remainingQuantity} ${item.unit}).`);
    }

    if (item.condition !== 'SELLABLE' && Number(item.restock_quantity || 0) > 0) {
      throw new Error(`${item.product_name} tidak boleh otomatis masuk stok sellable untuk kondisi rusak/discarded.`);
    }

    if (limits && !limits.can_restock && Number(item.restock_quantity || 0) > 0) {
      throw new Error(`${item.product_name} tidak boleh masuk stok karena source ini tidak memiliki efek stok.`);
    }
  }

  const totalAmount = Number(salesReturn.total_amount || 0);
  const refundAmount = Number(salesReturn.refund_amount || 0);
  const creditAmount = Number(salesReturn.credit_amount || 0);

  if (salesReturn.source_type === 'SALES_DELIVERY' && salesReturn.resolution !== 'NO_FINANCE') {
    throw new Error('Retur Sales Delivery production v1 hanya boleh memakai penyelesaian tanpa finance. Jika sudah menjadi invoice, buat retur dari invoice.');
  }

  if (salesReturn.resolution === 'REFUND' && refundAmount <= 0) {
    throw new Error('Refund wajib memiliki nilai lebih dari 0.');
  }

  if (salesReturn.resolution === 'REFUND' && Math.abs(refundAmount - totalAmount) > 0.01) {
    throw new Error('Production v1 belum mendukung campuran refund dan credit note. Pecah retur sesuai penyelesaian yang dibutuhkan.');
  }

  if (salesReturn.resolution === 'CREDIT_NOTE' && creditAmount <= 0) {
    throw new Error('Credit note wajib memiliki nilai lebih dari 0.');
  }

  if (salesReturn.resolution === 'CREDIT_NOTE' && Math.abs(creditAmount - totalAmount) > 0.01) {
    throw new Error('Production v1 belum mendukung campuran credit note dan refund. Pecah retur sesuai penyelesaian yang dibutuhkan.');
  }

  if (salesReturn.resolution === 'NO_FINANCE' && salesReturn.source_type === 'SALES_INVOICE' && totalAmount > 0) {
    throw new Error('Retur invoice bernilai harus memakai refund atau credit note.');
  }

  if (limits && salesReturn.source_type === 'SALES_INVOICE') {
    if (salesReturn.resolution === 'REFUND' && refundAmount > limits.refund_limit + 0.01) {
      throw new Error(`Refund melebihi uang invoice yang sudah diterima dan belum direfund. Maksimal refund Rp ${limits.refund_limit}.`);
    }

    if (salesReturn.resolution === 'CREDIT_NOTE' && creditAmount > limits.credit_note_limit + 0.01) {
      throw new Error(`Credit note melebihi outstanding invoice. Maksimal credit note Rp ${limits.credit_note_limit}.`);
    }
  }
};
