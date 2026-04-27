import * as XLSX from 'xlsx';
import { saveExportFile } from './fileSaver';
import type { ExportRows } from './csv';
import type { ExportTarget } from './fileSaver';

const XLSX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export type XlsxSheet = {
  name: string;
  rows: ExportRows;
};

const normalizeSheetName = (name: string, index: number) => {
  const cleaned = name.replace(/[\\/?*[\]:]/g, ' ').trim();
  return (cleaned || `Sheet ${index + 1}`).slice(0, 31);
};

export const exportXlsx = async ({ filename, sheets, target }: { filename: string; sheets: XlsxSheet[]; target?: ExportTarget }) => {
  const workbook = XLSX.utils.book_new();

  sheets.forEach((sheet, index) => {
    const worksheet = XLSX.utils.aoa_to_sheet(sheet.rows);
    XLSX.utils.book_append_sheet(workbook, worksheet, normalizeSheetName(sheet.name, index));
  });

  const content = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;

  return await saveExportFile({
    filename,
    mimeType: XLSX_MIME_TYPE,
    content,
    target,
  });
};
