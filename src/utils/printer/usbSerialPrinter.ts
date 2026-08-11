import { invoke } from '@tauri-apps/api/core';
import {
  PrinterError,
  PrinterErrorCode,
  PrinterTransport,
  ReceiptPayload,
  SelectedUsbPrinter,
  UsbSerialPrinterDevice,
} from '@/types';
import { normalizePrinterError } from '@/utils/printer/bluetoothPrinter';
import { isNativeTauri } from '@/utils/printer/bluetoothPrinter';
import { getHostPlatform } from '@/utils/export/platform';
import { getReceiptPaperCharacterWidth } from '@/utils/printer/receiptPaperSize';

export type { SelectedUsbPrinter, UsbSerialPrinterDevice };

// ─── Storage ──────────────────────────────────────────────────────────────────

const SELECTED_USB_PRINTER_KEY = 'frayukti-selected-usb-printer';

export const getStoredUsbPrinter = (): SelectedUsbPrinter | null => {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(SELECTED_USB_PRINTER_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<SelectedUsbPrinter>;
    if (!parsed.usbId || !parsed.baudRate) return null;
    return {
      name: parsed.name ?? parsed.usbId,
      usbId: parsed.usbId,
      baudRate: parsed.baudRate,
      portName: parsed.portName,
      transport: parsed.transport,
    };
  } catch {
    return null;
  }
};

export const saveStoredUsbPrinter = (printer: SelectedUsbPrinter) => {
  localStorage.setItem(SELECTED_USB_PRINTER_KEY, JSON.stringify(printer));
};

export const clearStoredUsbPrinter = () => {
  localStorage.removeItem(SELECTED_USB_PRINTER_KEY);
};

// ─── Platform check ───────────────────────────────────────────────────────────

export const isWebSerialSupported = (): boolean => {
  return isNativeTauri() || (typeof window !== 'undefined' && 'serial' in navigator);
};

const createPrinterError = (code: PrinterErrorCode, message: string): PrinterError => ({
  code,
  message,
});

// ─── Label & panduan per transport ────────────────────────────────────────────

const TRANSPORT_LABEL: Record<PrinterTransport, string> = {
  serial: 'USB Serial',
  'usb-printer': 'USB Printer',
  spooler: 'Windows Spooler',
  bluetooth: 'Bluetooth SPP',
};

export const getPrinterTransportLabel = (transport?: PrinterTransport): string =>
  transport ? TRANSPORT_LABEL[transport] : 'Serial';

/** Harus sama dengan SPOOLER_PORT_PREFIX di src-tauri/src/windows_printer.rs. */
export const SPOOLER_PORT_PREFIX = 'winspool:';

/** Nama port untuk ditampilkan, tanpa prefix internal jalur spooler. */
export const getDisplayPortName = (portName?: string): string => {
  if (!portName) return '';
  return portName.startsWith(SPOOLER_PORT_PREFIX)
    ? portName.slice(SPOOLER_PORT_PREFIX.length)
    : portName;
};

/**
 * Cara printer thermal terlihat oleh OS berbeda-beda, jadi panduan saat tidak
 * ada perangkat terdeteksi pun harus berbeda. Di Windows printer ESC/POS umumnya
 * terpasang sebagai printer spooler (port USB001), bukan sebagai COM port.
 */
export const noPrinterDetectedMessage = (): string => {
  switch (getHostPlatform()) {
    case 'windows':
      return 'Tidak ada printer terdeteksi. Pastikan printer menyala, lalu cek: printer thermal USB harus sudah terpasang di Windows (Settings › Printers & scanners), dan printer Bluetooth harus sudah di-pair sehingga Windows membuat COM port untuknya.';
    case 'linux':
      return 'Tidak ada printer terdeteksi. Pastikan printer menyala dan kabel USB tersambung. Kalau memakai /dev/usb/lp0, pastikan user tergabung di grup lp.';
    default:
      return 'Tidak ada printer terdeteksi. Pastikan printer menyala dan kabelnya tersambung.';
  }
};

const assertWebSerial = () => {
  if (!isWebSerialSupported() || isNativeTauri()) {
    throw createPrinterError(
      'UNSUPPORTED_PLATFORM',
      'Web Serial API tidak tersedia. Gunakan browser/WebView berbasis Chromium terbaru.'
    );
  }
};

export const listUsbSerialPrinters = async (): Promise<UsbSerialPrinterDevice[]> => {
  if (!isNativeTauri()) {
    return [];
  }

  try {
    return await invoke<UsbSerialPrinterDevice[]>('list_usb_serial_printers');
  } catch (error) {
    throw normalizePrinterError(error);
  }
};

// ─── ESC/POS helpers ──────────────────────────────────────────────────────────

const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;
const INIT = new Uint8Array([ESC, 0x40]);
// Kick both connector pins (2 and 5) since drawer wiring varies by brand.
const CASH_DRAWER_KICK = new Uint8Array([
  ESC, 0x70, 0x00, 0x19, 0xfa,
  ESC, 0x70, 0x01, 0x19, 0xfa,
]);
const CUT = new Uint8Array([GS, 0x56, 0x41, 0x00]);
const BOLD_ON = new Uint8Array([ESC, 0x45, 0x01]);
const BOLD_OFF = new Uint8Array([ESC, 0x45, 0x00]);
const ALIGN_CENTER = new Uint8Array([ESC, 0x61, 0x01]);
const ALIGN_LEFT = new Uint8Array([ESC, 0x61, 0x00]);
const QR_MODEL_2 = new Uint8Array([GS, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00]);
const QR_ERROR_CORRECTION_M = new Uint8Array([GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x31]);
const QR_PRINT = new Uint8Array([GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30]);

const encoder = new TextEncoder();

const text = (s: string) => encoder.encode(s + '\n');
const line = (ch = '-', len = 32) => text(ch.repeat(len));

const qrCode = (value: string, moduleSize: number): Uint8Array[] => {
  const data = encoder.encode(value);
  const storeLength = data.length + 3;
  const storeCommand = new Uint8Array(8 + data.length);

  storeCommand.set([
    GS,
    0x28,
    0x6b,
    storeLength & 0xff,
    (storeLength >> 8) & 0xff,
    0x31,
    0x50,
    0x30,
  ]);
  storeCommand.set(data, 8);

  return [
    QR_MODEL_2,
    new Uint8Array([GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, moduleSize]),
    QR_ERROR_CORRECTION_M,
    storeCommand,
    QR_PRINT,
  ];
};

const currencyFormat = (amount: number) =>
  new Intl.NumberFormat('id-ID').format(Math.round(amount));

const padLine = (left: string, right: string, total = 32): string => {
  const safeRight = right.slice(0, total);
  const maxLeftWidth = Math.max(1, total - safeRight.length - 1);
  const safeLeft = left.slice(0, maxLeftWidth);
  const spaces = total - safeLeft.length - safeRight.length;
  return safeLeft + ' '.repeat(Math.max(1, spaces)) + safeRight;
};

const wrapText = (value: string, width: number): string[] => {
  const words = value.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [''];

  const lines: string[] = [];
  let currentLine = '';
  words.forEach((word) => {
    if (word.length > width) {
      if (currentLine) lines.push(currentLine);
      for (let index = 0; index < word.length; index += width) {
        lines.push(word.slice(index, index + width));
      }
      currentLine = '';
      return;
    }

    const candidate = currentLine ? `${currentLine} ${word}` : word;
    if (candidate.length <= width) {
      currentLine = candidate;
    } else {
      lines.push(currentLine);
      currentLine = word;
    }
  });
  if (currentLine) lines.push(currentLine);
  return lines;
};

const ITEM_TABLE_WIDTHS = {
  name: 13,
  price: 12,
  quantity: 7,
  subtotal: 13,
} as const;

const formatTableCell = (value: string, width: number, alignRight = false): string => {
  const safeValue = value.length > width
    ? (alignRight ? value.slice(-width) : value.slice(0, width))
    : value;

  return alignRight ? safeValue.padStart(width) : safeValue.padEnd(width);
};

const formatItemTableRow = (
  name: string,
  price: string,
  quantity: string,
  subtotal: string
): string => [
  formatTableCell(name, ITEM_TABLE_WIDTHS.name),
  formatTableCell(price, ITEM_TABLE_WIDTHS.price, true),
  formatTableCell(quantity, ITEM_TABLE_WIDTHS.quantity, true),
  formatTableCell(subtotal, ITEM_TABLE_WIDTHS.subtotal, true),
].join(' ');

export const buildEscPosReceipt = (receipt: ReceiptPayload): Uint8Array => {
  const parts: Uint8Array[] = [];
  const paperWidth = getReceiptPaperCharacterWidth(receipt.paperSize);

  const push = (...chunks: Uint8Array[]) => parts.push(...chunks);

  push(INIT);
  if (receipt.openCashDrawer) push(CASH_DRAWER_KICK);
  push(ALIGN_CENTER, BOLD_ON);
  wrapText(receipt.merchantName, paperWidth).forEach((merchantLine) => push(text(merchantLine)));
  push(BOLD_OFF);
  push(text(`#${receipt.transactionNumber}`));
  push(text(new Date(receipt.createdAt).toLocaleString('id-ID')));
  if (receipt.memberName) {
    push(text(padLine('Member', receipt.memberNumber ? `${receipt.memberNumber}` : receipt.memberName, paperWidth)));
    if (receipt.memberNumber) {
      push(text(`  ${receipt.memberName}`));
    }
  }
  push(ALIGN_LEFT, line('-', paperWidth));

  if (receipt.paperSize === '80mm') {
    push(text(formatItemTableRow('Nama Produk', 'Harga', 'Jumlah', 'Subtotal')));
    push(line('-', paperWidth));

    for (const item of receipt.items) {
      const nameLines = wrapText(item.name, ITEM_TABLE_WIDTHS.name);
      const qty = `${item.quantity} ${item.unit}`.trim();
      const price = `Rp ${currencyFormat(item.price)}`;
      const subtotal = `Rp ${currencyFormat(item.subtotal)}`;

      push(text(formatItemTableRow(nameLines[0], price, qty, subtotal)));
      nameLines.slice(1).forEach((nameLine) => {
        push(text(formatItemTableRow(nameLine, '', '', '')));
      });
      if ((item.discountAmount ?? 0) > 0) {
        push(text(formatItemTableRow('Diskon', '', '', `-Rp ${currencyFormat(item.discountAmount!)}`)));
      }
    }
  } else {
    for (const item of receipt.items) {
      wrapText(item.name, paperWidth).forEach((itemLine) => push(text(itemLine)));
      const qty = `${item.quantity} ${item.unit}`;
      const price = `Rp ${currencyFormat(item.price)}`;
      const subtotal = `Rp ${currencyFormat(item.subtotal)}`;

      push(text(padLine(`  ${qty}`, price, paperWidth)));
      if ((item.discountAmount ?? 0) > 0) {
        push(text(padLine('  Diskon', `-Rp ${currencyFormat(item.discountAmount!)}`, paperWidth)));
      }
      push(text(padLine('  Subtotal', subtotal, paperWidth)));
    }
  }

  push(line('-', paperWidth));

  if ((receipt.subtotalAmount ?? 0) > 0 && receipt.subtotalAmount !== receipt.totalAmount) {
    push(text(padLine('Subtotal', `Rp ${currencyFormat(receipt.subtotalAmount!)}`, paperWidth)));
  }
  if ((receipt.discountAmount ?? 0) > 0) {
    push(text(padLine('Diskon', `-Rp ${currencyFormat(receipt.discountAmount!)}`, paperWidth)));
  }

  push(BOLD_ON, text(padLine('TOTAL', `Rp ${currencyFormat(receipt.totalAmount)}`, paperWidth)), BOLD_OFF);
  if (receipt.payments && receipt.payments.length > 0) {
    push(BOLD_ON, text('PEMBAYARAN'), BOLD_OFF);
    receipt.payments.forEach((payment) => {
      push(text(padLine(payment.methodName, `Rp ${currencyFormat(payment.tenderedAmount)}`, paperWidth)));
      if (payment.reference) push(text(`  Ref: ${payment.reference}`));
    });
  } else {
    const paymentMethodLabel = receipt.paymentMethodCode
      && receipt.paymentMethodCode.toUpperCase() !== receipt.paymentMethod.toUpperCase()
      ? `${receipt.paymentMethod} [${receipt.paymentMethodCode}]`
      : receipt.paymentMethod;
    push(text(padLine('Metode', paymentMethodLabel, paperWidth)));
    if (receipt.paymentReference) push(text(padLine('Referensi', receipt.paymentReference, paperWidth)));
  }
  push(text(padLine('Bayar', `Rp ${currencyFormat(receipt.paymentAmount)}`, paperWidth)));
  push(text(padLine('Kembali', `Rp ${currencyFormat(receipt.changeAmount)}`, paperWidth)));
  if (
    (receipt.membershipPointsEarned ?? 0) > 0 ||
    (receipt.membershipPointsRedeemed ?? 0) > 0
  ) {
    push(line('-', paperWidth));
    if ((receipt.membershipPointsRedeemed ?? 0) > 0) {
      push(text(padLine('Poin dipakai', `${receipt.membershipPointsRedeemed}`, paperWidth)));
    }
    if ((receipt.membershipPointsEarned ?? 0) > 0) {
      push(text(padLine('Poin didapat', `${receipt.membershipPointsEarned}`, paperWidth)));
    }
    if (receipt.membershipPointsBalanceAfter !== undefined) {
      push(text(padLine('Saldo poin', `${receipt.membershipPointsBalanceAfter}`, paperWidth)));
    }
  }

  push(line('-', paperWidth));
  push(ALIGN_CENTER);
  const transactionNumber = receipt.transactionNumber.trim();
  if (transactionNumber) {
    push(BOLD_ON, text('Scan nomor transaksi'), BOLD_OFF);
    push(...qrCode(transactionNumber, receipt.paperSize === '80mm' ? 6 : 5));
    push(new Uint8Array([LF]), text(`#${transactionNumber}`), text(''));
  }
  push(text(receipt.footer ?? 'Terima kasih'), ALIGN_LEFT);
  push(new Uint8Array([LF, LF, LF]));
  push(CUT);

  const total = parts.reduce((sum, p) => sum + p.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    result.set(p, offset);
    offset += p.length;
  }
  return result;
};

// ─── Write helper ─────────────────────────────────────────────────────────────

const writeToPort = async (port: SerialPort, data: Uint8Array): Promise<void> => {
  const writer = port.writable?.getWriter();
  if (!writer) throw new Error('Port tidak dapat ditulis.');
  try {
    await writer.write(data);
  } finally {
    writer.releaseLock();
  }
};

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Ask the browser to show the serial port picker and return the selected port
 * together with vendor/product info for display.
 */
export const requestUsbSerialPrinter = async (): Promise<SelectedUsbPrinter> => {
  if (isNativeTauri()) {
    const printers = await listUsbSerialPrinters();
    const printer = printers[0];

    if (!printer) {
      throw createPrinterError('PRINTER_NOT_SELECTED', noPrinterDetectedMessage());
    }

    return {
      name: printer.name,
      usbId: printer.usbId,
      portName: printer.portName,
      baudRate: 9600,
      transport: printer.transport,
    };
  }

  assertWebSerial();

  let port: SerialPort;
  try {
    port = await navigator.serial.requestPort();
  } catch (err) {
    if (err instanceof Error && err.name === 'NotFoundError') {
      throw createPrinterError('PRINTER_NOT_SELECTED', 'Tidak ada port yang dipilih.');
    }
    throw normalizePrinterError(err);
  }

  const info = port.getInfo();
  const vendorId = info.usbVendorId?.toString(16).padStart(4, '0') ?? '????';
  const productId = info.usbProductId?.toString(16).padStart(4, '0') ?? '????';
  const usbId = `${vendorId}:${productId}`;

  return {
    name: `USB Serial Printer (${usbId})`,
    usbId,
    baudRate: 9600,
  };
};

export const testPrintUsb = async (printer: SelectedUsbPrinter): Promise<void> => {
  const testData = new Uint8Array([
    ...Array.from(new Uint8Array([0x1b, 0x40])),          // INIT
    ...Array.from(new Uint8Array([0x1b, 0x61, 0x01])),    // CENTER
    ...Array.from(new TextEncoder().encode('-- TEST PRINT --\n')),
    ...Array.from(new TextEncoder().encode('USB Serial Printer\n')),
    ...Array.from(new Uint8Array([0x0a, 0x0a, 0x0a])),    // Feed
    ...Array.from(new Uint8Array([0x1d, 0x56, 0x41, 0x00])), // CUT
  ]);

  await writeUsbSerialData(printer, testData);
};

export const printReceiptUsb = async (
  printer: SelectedUsbPrinter,
  receipt: ReceiptPayload
): Promise<void> => {
  const data = buildEscPosReceipt(receipt);
  await writeUsbSerialData(printer, data);
};

const findGrantedWebSerialPort = async (printer: SelectedUsbPrinter): Promise<SerialPort> => {
  assertWebSerial();

  const ports = await navigator.serial.getPorts();
  if (ports.length === 0) {
    throw createPrinterError(
      'PRINTER_NOT_SELECTED',
      'Tidak ada USB Serial port yang diizinkan. Pilih ulang printer USB.'
    );
  }

  return ports.find((port) => {
    const info = port.getInfo();
    const vendorId = info.usbVendorId?.toString(16).padStart(4, '0') ?? '????';
    const productId = info.usbProductId?.toString(16).padStart(4, '0') ?? '????';
    return `${vendorId}:${productId}` === printer.usbId;
  }) ?? ports[0];
};

const writeUsbSerialData = async (
  printer: SelectedUsbPrinter,
  data: Uint8Array
): Promise<void> => {
  if (isNativeTauri()) {
    try {
      await invoke('write_usb_serial_printer', { printer, data: Array.from(data) });
      return;
    } catch (error) {
      throw normalizePrinterError(error);
    }
  }

  const port = await findGrantedWebSerialPort(printer);
  try {
    await port.open({ baudRate: printer.baudRate });
    await writeToPort(port, data);
  } catch (error) {
    throw normalizePrinterError(error);
  } finally {
    try { await port.close(); } catch { /* ignore */ }
  }
};
