import { App } from 'antd';
import jsPDF from 'jspdf';
import { exportCsv, exportPdf, type ExportRows, type ExportTarget } from '@/utils/export';

interface ExportPdfOptions {
  filename: string;
  target?: ExportTarget;
  build: (doc: jsPDF) => void | jsPDF;
  successMessage: string;
  errorMessage: string;
  errorConsoleMsg?: string;
}

interface ExportCsvOptions {
  filename: string;
  target?: ExportTarget;
  rows: ExportRows;
  successMessage: string;
  errorMessage: string;
  errorConsoleMsg?: string;
}

export function useExportPdf() {
  const { message } = App.useApp();

  const handleExportPdf = async (options: ExportPdfOptions) => {
    const { filename, target = 'auto', build, successMessage, errorMessage, errorConsoleMsg = 'Failed to export PDF:' } = options;
    try {
      const exported = await exportPdf({
        filename,
        target,
        build,
      });

      if (!exported) return false;
      message.success(successMessage);
      return true;
    } catch (error) {
      console.error(errorConsoleMsg, error);
      message.error(errorMessage);
      return false;
    }
  };

  return handleExportPdf;
}

export function useExportCsv() {
  const { message } = App.useApp();

  const handleExportCsv = async (options: ExportCsvOptions) => {
    const { filename, target = 'auto', rows, successMessage, errorMessage, errorConsoleMsg = 'Failed to export CSV:' } = options;
    try {
      const exported = await exportCsv({
        filename,
        rows,
        target,
      });

      if (!exported) return false;
      message.success(successMessage);
      return true;
    } catch (error) {
      console.error(errorConsoleMsg, error);
      message.error(errorMessage);
      return false;
    }
  };

  return handleExportCsv;
}
