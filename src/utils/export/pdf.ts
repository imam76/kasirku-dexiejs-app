import html2canvas from 'html2canvas';
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

export const exportHtmlPdf = async ({
  filename,
  element,
  target,
  orientation = 'portrait',
  pageMargin = 24,
  scale = 2,
}: {
  filename: string;
  element: HTMLElement;
  target?: ExportTarget;
  orientation?: 'portrait' | 'landscape';
  pageMargin?: number;
  scale?: number;
}) => {
  const canvas = await html2canvas(element, {
    backgroundColor: '#ffffff',
    scale,
    useCORS: true,
    windowHeight: element.scrollHeight,
    windowWidth: element.scrollWidth,
  });
  const doc = new jsPDF({
    format: 'a4',
    orientation,
    unit: 'pt',
  });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = pageWidth - (pageMargin * 2);
  const contentHeight = pageHeight - (pageMargin * 2);
  const imageData = canvas.toDataURL('image/png');
  const imageHeight = (canvas.height * contentWidth) / canvas.width;
  const pageCount = Math.max(1, Math.ceil(imageHeight / contentHeight));

  for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
    if (pageIndex > 0) doc.addPage();
    doc.addImage(
      imageData,
      'PNG',
      pageMargin,
      pageMargin - (pageIndex * contentHeight),
      contentWidth,
      imageHeight,
    );
  }

  return await saveExportFile({
    filename,
    mimeType: PDF_MIME_TYPE,
    content: doc.output('arraybuffer'),
    target,
  });
};
