import type { SalesDocument, SalesReturn, SalesReturnSourceType, Transaction } from '@/types';

export const createSalesDocumentReturnSnapshot = (
  source: SalesDocument,
): Pick<
  SalesReturn,
  | 'source_type'
  | 'source_id'
  | 'source_number'
  | 'source_document_type'
  | 'contact_id'
  | 'customer_name'
  | 'customer_phone'
  | 'customer_email'
  | 'customer_address'
> => ({
  source_type: source.type as Extract<SalesReturnSourceType, 'SALES_DELIVERY' | 'SALES_INVOICE'>,
  source_id: source.id,
  source_number: source.document_number,
  source_document_type: source.type,
  contact_id: source.contact_id,
  customer_name: source.customer_name,
  customer_phone: source.customer_phone,
  customer_email: source.customer_email,
  customer_address: source.customer_address,
});

export const createPosTransactionReturnSnapshot = (
  source: Transaction,
): Pick<SalesReturn, 'source_type' | 'source_id' | 'source_number' | 'customer_name'> => ({
  source_type: 'POS_TRANSACTION',
  source_id: source.id,
  source_number: source.transaction_number,
  customer_name: 'POS Customer',
});
