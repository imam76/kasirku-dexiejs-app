import type { SalesReturnSourceType } from '@/types';

export interface SalesReturnStockPolicy {
  can_restock: boolean;
  source_stock_document_id?: string;
  source_stock_document_type?: 'SALES_DELIVERY';
  source_stock_document_number?: string;
  reason: string;
}

interface GetSalesReturnStockPolicyInput {
  source_type: SalesReturnSourceType;
  source_id: string;
  source_number?: string;
  source_stock_document_id?: string;
  source_stock_document_type?: 'SALES_DELIVERY';
  source_stock_document_number?: string;
}

export const getSalesReturnStockPolicy = ({
  source_type,
  source_id,
  source_number,
  source_stock_document_id,
  source_stock_document_type,
  source_stock_document_number,
}: GetSalesReturnStockPolicyInput): SalesReturnStockPolicy => {
  if (source_type === 'SALES_DELIVERY') {
    return {
      can_restock: true,
      source_stock_document_id: source_id,
      source_stock_document_type: 'SALES_DELIVERY',
      source_stock_document_number: source_number,
      reason: 'Sales Delivery mengurangi stok saat diterbitkan.',
    };
  }

  if (
    source_type === 'SALES_INVOICE' &&
    source_stock_document_id &&
    source_stock_document_type === 'SALES_DELIVERY'
  ) {
    return {
      can_restock: true,
      source_stock_document_id,
      source_stock_document_type,
      source_stock_document_number,
      reason: 'Invoice berasal dari Sales Delivery yang sudah mengurangi stok.',
    };
  }

  return {
    can_restock: false,
    reason: source_type === 'SALES_INVOICE'
      ? 'Sales Invoice langsung tidak mengurangi stok.'
      : 'Source ini tidak memiliki efek stok pada Sales Return production v1.',
  };
};
