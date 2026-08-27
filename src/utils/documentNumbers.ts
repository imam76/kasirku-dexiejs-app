import type { Table } from 'dexie';
import { getBusinessDayBoundsIso, toBusinessDatePrefix } from '@/utils/businessDate';

export interface DocumentNumberRecord {
  document_number: string;
  created_at: string;
}

export const createDocumentNumber = async <TRecord extends DocumentNumberRecord>(
  prefix: string,
  date: Date,
  tableReader: Table<TRecord, string>,
) => {
  const datePart = toBusinessDatePrefix(date);
  const { startIso, endIso } = getBusinessDayBoundsIso(date);

  const count = await tableReader
    .where('created_at')
    .between(startIso, endIso, true, true)
    .and((document) => document.document_number.startsWith(`${prefix}-${datePart}`))
    .count();

  return `${prefix}-${datePart}-${String(count + 1).padStart(4, '0')}`;
};
