import type { ReceiptPaperSize } from '@/types';

const RECEIPT_PAPER_SIZE_STORAGE_KEY = 'frayukti-receipt-paper-size';

export const DEFAULT_RECEIPT_PAPER_SIZE: ReceiptPaperSize = '58mm';

export const RECEIPT_PAPER_CHARACTER_WIDTH: Record<ReceiptPaperSize, number> = {
  '58mm': 32,
  '80mm': 48,
};

export const isReceiptPaperSize = (value: unknown): value is ReceiptPaperSize => (
  value === '58mm' || value === '80mm'
);

export const getStoredReceiptPaperSize = (): ReceiptPaperSize => {
  if (typeof window === 'undefined') return DEFAULT_RECEIPT_PAPER_SIZE;

  const storedValue = localStorage.getItem(RECEIPT_PAPER_SIZE_STORAGE_KEY);
  return isReceiptPaperSize(storedValue) ? storedValue : DEFAULT_RECEIPT_PAPER_SIZE;
};

export const saveStoredReceiptPaperSize = (paperSize: ReceiptPaperSize) => {
  if (typeof window === 'undefined') return;
  localStorage.setItem(RECEIPT_PAPER_SIZE_STORAGE_KEY, paperSize);
};

export const getReceiptPaperCharacterWidth = (paperSize: ReceiptPaperSize) => (
  RECEIPT_PAPER_CHARACTER_WIDTH[paperSize]
);
