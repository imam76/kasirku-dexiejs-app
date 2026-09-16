import Dexie, { type Table } from 'dexie';
import { db } from '@/lib/db';
import type {
  PurchaseDocument,
  PurchaseDocumentStatus,
  PurchaseDocumentType,
  SalesDocument,
  SalesDocumentStatus,
  SalesDocumentType,
} from '@/types';
import {
  normalizeCursorPageSize,
  type DateIdCursor,
  type DateIdCursorPage,
} from '@/services/shared/dateIdCursor';

const DOCUMENT_PAGE_SIZE = 40;

interface BaseDocumentListOptions<TType extends string, TStatus extends string> {
  type: TType;
  startDate: string;
  endDate: string;
  status?: TStatus;
  search?: string;
  cursor?: DateIdCursor;
  limit?: number;
}

export type SalesDocumentListOptions = BaseDocumentListOptions<
  SalesDocumentType,
  SalesDocumentStatus
>;

export type PurchaseDocumentListOptions = BaseDocumentListOptions<
  PurchaseDocumentType,
  PurchaseDocumentStatus
>;

type CursorDocument = {
  id: string;
  type: string;
  status: string;
  document_date: string;
};

const includesSearch = (value: string | undefined, search: string) => (
  value?.toLocaleLowerCase().includes(search) ?? false
);

const readDocumentPage = async <TDocument extends CursorDocument>({
  table,
  options,
  matchesSearch,
}: {
  table: Table<TDocument, string>;
  options: BaseDocumentListOptions<string, string>;
  matchesSearch: (document: TDocument, search: string) => boolean;
}): Promise<DateIdCursorPage<TDocument>> => {
  const limit = normalizeCursorPageSize(options.limit, DOCUMENT_PAGE_SIZE);
  const search = options.search?.trim().toLocaleLowerCase() ?? '';
  const upperBound = options.cursor
    ? [options.type, options.cursor.date, options.cursor.id]
    : [options.type, `${options.endDate}\uffff`, Dexie.maxKey];
  const rows = await table
    .where('[type+document_date+id]')
    .between(
      [options.type, options.startDate, Dexie.minKey],
      upperBound,
      true,
      !options.cursor,
    )
    .reverse()
    .filter((document) => (
      (!options.status || document.status === options.status)
      && (!search || matchesSearch(document, search))
    ))
    .limit(limit + 1)
    .toArray();

  const visibleRows = rows.slice(0, limit);
  const lastVisible = visibleRows[visibleRows.length - 1];

  return {
    rows: visibleRows,
    nextCursor: rows.length > limit && lastVisible
      ? { date: lastVisible.document_date, id: lastVisible.id }
      : undefined,
  };
};

export const listSalesDocumentPage = (
  options: SalesDocumentListOptions,
): Promise<DateIdCursorPage<SalesDocument>> => readDocumentPage({
  table: db.salesDocuments,
  options,
  matchesSearch: (document, search) => [
    document.document_number,
    document.customer_name,
    document.project_name,
    document.department_name,
  ].some((value) => includesSearch(value, search)),
});

export const listPurchaseDocumentPage = (
  options: PurchaseDocumentListOptions,
): Promise<DateIdCursorPage<PurchaseDocument>> => readDocumentPage({
  table: db.purchaseDocuments,
  options,
  matchesSearch: (document, search) => [
    document.document_number,
    document.supplier_name,
    document.project_name,
    document.department_name,
  ].some((value) => includesSearch(value, search)),
});
