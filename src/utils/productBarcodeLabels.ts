import JsBarcode from 'jsbarcode';
import type jsPDF from 'jspdf';
import type { Product } from '@/types';

/**
 * Lembar label A4 4 kolom x 11 baris. Ukurannya sengaja mengikuti kertas label
 * umum (±47 x 25 mm) supaya bisa dicetak di A4 biasa lalu digunting, atau di
 * kertas label siap tempel tanpa perlu setelan tambahan.
 */
const PAGE_MARGIN_MM = 10;
const COLUMNS = 4;
const LABEL_HEIGHT_MM = 25;
const LABEL_PADDING_MM = 2;
const TITLE_FONT_SIZE_PT = 6.5;
const BARCODE_HEIGHT_MM = 15;

export interface BarcodeLabelItem {
  name: string;
  sku: string;
}

export const buildBarcodeLabelItems = (products: Product[]) => {
  const items: BarcodeLabelItem[] = [];
  const skipped: Product[] = [];

  products.forEach((product) => {
    const sku = product.sku?.trim();
    if (sku) items.push({ name: product.name, sku });
    else skipped.push(product);
  });

  return { items, skipped };
};

const renderBarcodePng = (value: string) => {
  const canvas = document.createElement('canvas');
  // CODE128 menerima semua karakter ASCII, jadi SKU berformat bebas tetap bisa dipindai.
  JsBarcode(canvas, value, {
    format: 'CODE128',
    displayValue: false,
    margin: 0,
    width: 2,
    height: 80,
  });
  return { dataUrl: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height };
};

const fitText = (doc: jsPDF, text: string, maxWidth: number) => {
  if (doc.getTextWidth(text) <= maxWidth) return text;
  let trimmed = text;
  while (trimmed.length > 1 && doc.getTextWidth(`${trimmed}…`) > maxWidth) {
    trimmed = trimmed.slice(0, -1);
  }
  return `${trimmed.trimEnd()}…`;
};

export const drawBarcodeLabels = (doc: jsPDF, items: BarcodeLabelItem[]) => {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const labelWidth = (pageWidth - PAGE_MARGIN_MM * 2) / COLUMNS;
  const rows = Math.floor((pageHeight - PAGE_MARGIN_MM * 2) / LABEL_HEIGHT_MM);
  const perPage = COLUMNS * rows;
  const contentWidth = labelWidth - LABEL_PADDING_MM * 2;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(TITLE_FONT_SIZE_PT);
  doc.setDrawColor(220);
  doc.setLineWidth(0.1);

  items.forEach((item, index) => {
    if (index > 0 && index % perPage === 0) doc.addPage();

    const slot = index % perPage;
    const x = PAGE_MARGIN_MM + (slot % COLUMNS) * labelWidth;
    const y = PAGE_MARGIN_MM + Math.floor(slot / COLUMNS) * LABEL_HEIGHT_MM;
    const innerX = x + LABEL_PADDING_MM;

    // Garis tipis sebagai panduan gunting.
    doc.rect(x, y, labelWidth, LABEL_HEIGHT_MM);

    // Nama dipotong dulu supaya SKU selalu tampil utuh di baris yang sama.
    const suffix = ` - ${item.sku}`;
    const name = fitText(doc, item.name, Math.max(contentWidth - doc.getTextWidth(suffix), contentWidth * 0.3));
    const title = fitText(doc, `${name}${suffix}`, contentWidth);
    doc.text(title, x + labelWidth / 2, y + LABEL_PADDING_MM + 2.2, { align: 'center' });

    const barcode = renderBarcodePng(item.sku);
    const barcodeWidth = Math.min(contentWidth, (barcode.width / barcode.height) * BARCODE_HEIGHT_MM);
    doc.addImage(
      barcode.dataUrl,
      'PNG',
      innerX + (contentWidth - barcodeWidth) / 2,
      y + LABEL_PADDING_MM + 4,
      barcodeWidth,
      BARCODE_HEIGHT_MM,
    );
  });

  return doc;
};
