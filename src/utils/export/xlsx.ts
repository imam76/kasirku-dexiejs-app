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

/**
 * Isi workbook dipisah dari penyimpanannya supaya hasilnya bisa dibaca balik di
 * test tanpa menyentuh dialog simpan file — penting untuk format yang memang
 * dimaksudkan bolak-balik lewat import.
 */
export const createXlsxContent = (sheets: XlsxSheet[]) => {
  const workbook = XLSX.utils.book_new();

  sheets.forEach((sheet, index) => {
    const worksheet = XLSX.utils.aoa_to_sheet(sheet.rows);
    XLSX.utils.book_append_sheet(workbook, worksheet, normalizeSheetName(sheet.name, index));
  });

  return XLSX.write(workbook, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
};

export const exportXlsx = async ({ filename, sheets, target }: { filename: string; sheets: XlsxSheet[]; target?: ExportTarget }) => {
  const content = createXlsxContent(sheets);

  return await saveExportFile({
    filename,
    mimeType: XLSX_MIME_TYPE,
    content,
    target,
  });
};
