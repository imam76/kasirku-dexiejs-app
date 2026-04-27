import jsPDF from 'jspdf';
import { saveExportFile } from './fileSaver';
import type { ExportTarget } from './fileSaver';

const PDF_MIME_TYPE = 'application/pdf';

export const exportPdf = async ({
  filename,
  build,
  target,
}: {
  filename: string;
  build: (doc: jsPDF) => void | jsPDF;
  target?: ExportTarget;
}) => {
  const doc = new jsPDF();
  const builtDoc = build(doc) ?? doc;

  return await saveExportFile({
    filename,
    mimeType: PDF_MIME_TYPE,
    content: builtDoc.output('arraybuffer'),
    target,
  });
};
