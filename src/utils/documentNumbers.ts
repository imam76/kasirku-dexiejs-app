import type { Table } from 'dexie';

export interface DocumentNumberRecord {
  document_number: string;
  created_at: string;
}

export const createDocumentNumber = async <TRecord extends DocumentNumberRecord>(
  prefix: string,
  date: Date,
  tableReader: Table<TRecord, string>,
) => {
  const datePart = date.toISOString().slice(0, 10).replace(/-/g, '');
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(date);
  dayEnd.setHours(23, 59, 59, 999);

  const count = await tableReader
    .where('created_at')
    .between(dayStart.toISOString(), dayEnd.toISOString(), true, true)
    .and((document) => document.document_number.startsWith(`${prefix}-${datePart}`))
    .count();

  return `${prefix}-${datePart}-${String(count + 1).padStart(4, '0')}`;
};
