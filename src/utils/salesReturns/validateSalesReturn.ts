import type {
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
  }

  if (salesReturn.resolution === 'REFUND' && Number(salesReturn.refund_amount || 0) <= 0) {
    throw new Error('Refund wajib memiliki nilai lebih dari 0.');
  }

  if (salesReturn.resolution === 'CREDIT_NOTE' && Number(salesReturn.credit_amount || 0) <= 0) {
    throw new Error('Credit note wajib memiliki nilai lebih dari 0.');
  }

  if (salesReturn.resolution === 'NO_FINANCE' && salesReturn.source_type === 'SALES_INVOICE' && Number(salesReturn.total_amount || 0) > 0) {
    throw new Error('Retur invoice bernilai harus memakai refund atau credit note.');
  }
};
