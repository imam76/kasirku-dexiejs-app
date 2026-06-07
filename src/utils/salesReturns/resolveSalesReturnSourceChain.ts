import type {
  SalesDocument,
  SalesDocumentItem,
  SalesReturnSourceType,
} from '@/types';

export interface SalesReturnSourceChain {
  source_type: SalesReturnSourceType;
  source_id: string;
  source_number: string;
  can_return_from_source: boolean;
  return_from_source_block_reason?: string;
  preferred_return_source_id?: string;
  preferred_return_source_number?: string;
  source_chain_label?: string;
  source_stock_document_id?: string;
  source_stock_document_type?: 'SALES_DELIVERY';
  source_stock_document_number?: string;
  current_item_id_by_chain_item_id: Record<string, string>;
  chain_item_ids_by_current_item_id: Record<string, string[]>;
  source_stock_item_id_by_current_item_id: Record<string, string>;
}

interface ResolveSalesReturnSourceChainInput {
  sourceType: SalesReturnSourceType;
  source: SalesDocument;
  sourceItems: SalesDocumentItem[];
  relatedDocuments?: SalesDocument[];
  relatedItemsByDocumentId?: Record<string, SalesDocumentItem[]>;
}

const getComparableQuantity = (item: SalesDocumentItem) => Number(item.delivered_quantity ?? item.quantity ?? 0);

const findMatchingRelatedItem = (
  sourceItem: SalesDocumentItem,
  relatedItems: SalesDocumentItem[],
  usedRelatedItemIds: Set<string>,
) => {
  const candidates = relatedItems.filter((item) => !usedRelatedItemIds.has(item.id));
  const sourceQuantity = getComparableQuantity(sourceItem);
  const exactMatch = candidates.find((item) => (
    item.product_id === sourceItem.product_id &&
    item.unit === sourceItem.unit &&
    getComparableQuantity(item) === sourceQuantity
  ));

  if (exactMatch) return exactMatch;

  const unitMatch = candidates.find((item) => (
    item.product_id === sourceItem.product_id &&
    item.unit === sourceItem.unit
  ));

  if (unitMatch) return unitMatch;

  return candidates.find((item) => item.product_id === sourceItem.product_id);
};

const addAlias = (
  chain: SalesReturnSourceChain,
  currentItemId: string,
  chainItemId: string,
) => {
  chain.current_item_id_by_chain_item_id[chainItemId] = currentItemId;
  const aliases = chain.chain_item_ids_by_current_item_id[currentItemId] ?? [];
  if (!aliases.includes(chainItemId)) {
    aliases.push(chainItemId);
  }
  chain.chain_item_ids_by_current_item_id[currentItemId] = aliases;
};

export const resolveSalesReturnSourceChain = ({
  sourceType,
  source,
  sourceItems,
  relatedDocuments = [],
  relatedItemsByDocumentId = {},
}: ResolveSalesReturnSourceChainInput): SalesReturnSourceChain => {
  const chain: SalesReturnSourceChain = {
    source_type: sourceType,
    source_id: source.id,
    source_number: source.document_number,
    can_return_from_source: true,
    current_item_id_by_chain_item_id: {},
    chain_item_ids_by_current_item_id: {},
    source_stock_item_id_by_current_item_id: {},
  };

  sourceItems.forEach((item) => addAlias(chain, item.id, item.id));

  if (sourceType === 'SALES_INVOICE' && source.source_document_type === 'SALES_DELIVERY' && source.source_document_id) {
    const delivery = relatedDocuments.find((document) => document.id === source.source_document_id);
    const deliveryItems = relatedItemsByDocumentId[source.source_document_id] ?? [];
    const usedDeliveryItemIds = new Set<string>();

    chain.source_stock_document_id = source.source_document_id;
    chain.source_stock_document_type = 'SALES_DELIVERY';
    chain.source_stock_document_number = delivery?.document_number ?? source.source_document_number;
    chain.source_chain_label = chain.source_stock_document_number
      ? `Invoice dari Delivery ${chain.source_stock_document_number}`
      : undefined;

    sourceItems.forEach((invoiceItem) => {
      const deliveryItem = findMatchingRelatedItem(invoiceItem, deliveryItems, usedDeliveryItemIds);
      if (!deliveryItem) return;

      usedDeliveryItemIds.add(deliveryItem.id);
      addAlias(chain, invoiceItem.id, deliveryItem.id);
      chain.source_stock_item_id_by_current_item_id[invoiceItem.id] = deliveryItem.id;
    });
  }

  if (sourceType === 'SALES_DELIVERY') {
    const relatedInvoices = relatedDocuments.filter((document) => (
      document.type === 'SALES_INVOICE' &&
      document.source_document_id === source.id &&
      document.source_document_type === 'SALES_DELIVERY' &&
      document.status !== 'VOIDED'
    ));
    const preferredInvoice = relatedInvoices.find((document) => document.status === 'ISSUED') ?? relatedInvoices[0];

    chain.source_stock_document_id = source.id;
    chain.source_stock_document_type = 'SALES_DELIVERY';
    chain.source_stock_document_number = source.document_number;

    if (preferredInvoice) {
      chain.can_return_from_source = false;
      chain.preferred_return_source_id = preferredInvoice.id;
      chain.preferred_return_source_number = preferredInvoice.document_number;
      chain.return_from_source_block_reason = `Sales Delivery ini sudah dikonversi ke Sales Invoice ${preferredInvoice.document_number}. Buat retur dari invoice tersebut.`;
    }

    relatedInvoices.forEach((invoice) => {
      const invoiceItems = relatedItemsByDocumentId[invoice.id] ?? [];
      const usedInvoiceItemIds = new Set<string>();

      sourceItems.forEach((deliveryItem) => {
        const invoiceItem = findMatchingRelatedItem(deliveryItem, invoiceItems, usedInvoiceItemIds);
        if (!invoiceItem) return;

        usedInvoiceItemIds.add(invoiceItem.id);
        addAlias(chain, deliveryItem.id, invoiceItem.id);
      });
    });
  }

  return chain;
};
