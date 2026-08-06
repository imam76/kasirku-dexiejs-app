import * as XLSX from 'xlsx';

const CSV_EXTENSIONS = ['.csv'];
const WORKBOOK_EXTENSIONS = ['.xlsx', '.xls'];

export const isSupportedProductImportFile = (fileName: string) => {
  const normalized = fileName.toLowerCase();
  return [...CSV_EXTENSIONS, ...WORKBOOK_EXTENSIONS].some((ext) => normalized.endsWith(ext));
};

export const isWorkbookFile = (fileName: string) => {
  const normalized = fileName.toLowerCase();
  return WORKBOOK_EXTENSIONS.some((ext) => normalized.endsWith(ext));
};

/**
 * Reads the first sheet as plain text cells so the workbook and the CSV path
 * share one parser. `raw: false` hands over the value the user actually sees in
 * Excel, which `parseNumberFlexible` then normalizes like any CSV cell.
 */
export const readWorkbookRows = async (file: File): Promise<string[][]> => {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];

  const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], {
    header: 1,
    raw: false,
    defval: '',
    blankrows: false,
  });

  return rows
    .map((row) => row.map((cell) => (cell === null || cell === undefined ? '' : String(cell).trim())))
    .filter((row) => row.some((cell) => cell.length > 0));
};
