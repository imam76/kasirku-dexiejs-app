import { saveExportFile } from './fileSaver';
import type { ExportTarget } from './fileSaver';

export type ExportCell = string | number | boolean | null | undefined;
export type ExportRows = ExportCell[][];

const CSV_MIME_TYPE = 'text/csv';
const UTF8_BOM = '\uFEFF';

const escapeCsvValue = (value: ExportCell) => {
  if (value === null || value === undefined) return '';

  const raw = String(value).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  if (!/[",\n]/.test(raw)) return raw;

  return `"${raw.replace(/"/g, '""')}"`;
};

export const createCsvContent = (rows: ExportRows) => rows.map((row) => row.map(escapeCsvValue).join(',')).join('\n');

export const exportCsv = async ({ filename, rows, target }: { filename: string; rows: ExportRows; target?: ExportTarget }) => {
  return await saveExportFile({
    filename,
    mimeType: CSV_MIME_TYPE,
    content: `${UTF8_BOM}${createCsvContent(rows)}`,
    target,
  });
};
