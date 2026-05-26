import { db } from '@/lib/db';
import type {
  IssuedSalesReturnSummary,
  SalesDocument,
  SalesDocumentItem,
  SalesReturn,
  SalesReturnItem,
  SalesReturnSourceType,
} from '@/types';
import {
  aggregateIssuedSalesReturns,
  aggregateIssuedSalesReturnsForSourceChain,
  createEmptyIssuedSalesReturnSummary,
} from '@/utils/salesReturns/aggregateSalesReturns';
import { resolveSalesReturnSourceChain } from '@/utils/salesReturns/resolveSalesReturnSourceChain';

interface ReadSummaryOptions {
  excludeReturnId?: string;
}

export const loadSalesReturnSourceChain = async (
  sourceType: SalesReturnSourceType,
  sourceId: string,
) => {
  if (sourceType !== 'SALES_DELIVERY' && sourceType !== 'SALES_INVOICE') {
    return undefined;
  }

  const source = await db.salesDocuments.get(sourceId);
  if (!source) throw new Error('Source dokumen tidak ditemukan.');

  const sourceItems = await db.salesDocumentItems.where('document_id').equals(sourceId).toArray();
  const relatedDocuments: SalesDocument[] = [];

  if (sourceType === 'SALES_INVOICE' && source.source_document_type === 'SALES_DELIVERY' && source.source_document_id) {
    const delivery = await db.salesDocuments.get(source.source_document_id);
    if (delivery) {
      relatedDocuments.push(delivery);
    }
  }

  if (sourceType === 'SALES_DELIVERY') {
    const invoices = await db.salesDocuments
      .where('source_document_id')
      .equals(sourceId)
      .filter((document) => document.type === 'SALES_INVOICE' && document.source_document_type === 'SALES_DELIVERY')
      .toArray();
    relatedDocuments.push(...invoices);
  }

  const relatedItemsByDocumentId: Record<string, SalesDocumentItem[]> = {};
  await Promise.all(relatedDocuments.map(async (document) => {
    relatedItemsByDocumentId[document.id] = await db.salesDocumentItems
      .where('document_id')
      .equals(document.id)
      .toArray();
  }));

  return {
    source,
    sourceItems,
    relatedDocuments,
    relatedItemsByDocumentId,
    chain: resolveSalesReturnSourceChain({
      sourceType,
      source,
      sourceItems,
      relatedDocuments,
      relatedItemsByDocumentId,
    }),
  };
};

const loadIssuedReturnsForSources = async (
  sourceKeys: Array<{ source_type: SalesReturnSourceType; source_id: string }>,
  options: ReadSummaryOptions = {},
) => {
  if (sourceKeys.length === 0) {
    return { salesReturns: [], salesReturnItems: [] as SalesReturnItem[] };
  }

  const sourceIds = Array.from(new Set(sourceKeys.map((source) => source.source_id)));
  const sourceKeySet = new Set(sourceKeys.map((source) => `${source.source_type}:${source.source_id}`));
  const salesReturns = (await db.salesReturns
    .where('source_id')
    .anyOf(sourceIds)
    .filter((salesReturn) => (
      salesReturn.status === 'ISSUED' &&
      salesReturn.id !== options.excludeReturnId &&
      sourceKeySet.has(`${salesReturn.source_type}:${salesReturn.source_id}`)
    ))
    .toArray());

  if (salesReturns.length === 0) {
    return { salesReturns, salesReturnItems: [] as SalesReturnItem[] };
  }

  const salesReturnItems = await db.salesReturnItems
    .where('return_id')
    .anyOf(salesReturns.map((salesReturn) => salesReturn.id))
    .toArray();

  return { salesReturns, salesReturnItems };
};

export const getIssuedReturnSummaryForSource = async (
  sourceType: SalesReturnSourceType,
  sourceId: string,
  options: ReadSummaryOptions = {},
): Promise<IssuedSalesReturnSummary> => {
  const sourceChain = await loadSalesReturnSourceChain(sourceType, sourceId);

  if (!sourceChain) {
    const { salesReturns, salesReturnItems } = await loadIssuedReturnsForSources(
      [{ source_type: sourceType, source_id: sourceId }],
      options,
    );

    if (salesReturns.length === 0) {
      return createEmptyIssuedSalesReturnSummary(sourceType, sourceId);
    }

    return aggregateIssuedSalesReturns(sourceType, sourceId, salesReturns, salesReturnItems);
  }

  const relatedSourceKeys = [
    { source_type: sourceType, source_id: sourceId },
    ...sourceChain.relatedDocuments
      .filter((document) => document.type === 'SALES_DELIVERY' || document.type === 'SALES_INVOICE')
      .map((document) => ({ source_type: document.type as SalesReturnSourceType, source_id: document.id })),
  ];
  const uniqueSourceKeys = Array.from(
    new Map(relatedSourceKeys.map((source) => [`${source.source_type}:${source.source_id}`, source])).values(),
  );
  const { salesReturns, salesReturnItems } = await loadIssuedReturnsForSources(uniqueSourceKeys, options);

  if (salesReturns.length === 0) {
    return createEmptyIssuedSalesReturnSummary(sourceType, sourceId);
  }

  return aggregateIssuedSalesReturnsForSourceChain(
    sourceType,
    sourceId,
    salesReturns,
    salesReturnItems,
    (item: SalesReturnItem, salesReturn: SalesReturn) => {
      if (!uniqueSourceKeys.some((source) => source.source_type === salesReturn.source_type && source.source_id === salesReturn.source_id)) {
        return undefined;
      }

      return (
        sourceChain.chain.current_item_id_by_chain_item_id[item.source_item_id] ??
        (item.source_stock_item_id ? sourceChain.chain.current_item_id_by_chain_item_id[item.source_stock_item_id] : undefined)
      );
    },
  );
};
