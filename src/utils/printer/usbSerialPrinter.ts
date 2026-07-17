import { invoke } from '@tauri-apps/api/core';
import {
  PrinterError,
  PrinterErrorCode,
  ReceiptPayload,
  SelectedUsbPrinter,
  UsbSerialPrinterDevice,
} from '@/types';
import { normalizePrinterError } from '@/utils/printer/bluetoothPrinter';
import { isNativeTauri } from '@/utils/printer/bluetoothPrinter';

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
const CUT = new Uint8Array([GS, 0x56, 0x41, 0x00]);
const BOLD_ON = new Uint8Array([ESC, 0x45, 0x01]);
const BOLD_OFF = new Uint8Array([ESC, 0x45, 0x00]);
const ALIGN_CENTER = new Uint8Array([ESC, 0x61, 0x01]);
const ALIGN_LEFT = new Uint8Array([ESC, 0x61, 0x00]);

const encoder = new TextEncoder();

const text = (s: string) => encoder.encode(s + '\n');
const line = (ch = '-', len = 32) => text(ch.repeat(len));

const currencyFormat = (amount: number) =>
  new Intl.NumberFormat('id-ID').format(Math.round(amount));

const padLine = (left: string, right: string, total = 32): string => {
  const spaces = total - left.length - right.length;
  return left + ' '.repeat(Math.max(1, spaces)) + right;
};

const buildEscPosReceipt = (receipt: ReceiptPayload): Uint8Array => {
  const parts: Uint8Array[] = [];

  const push = (...chunks: Uint8Array[]) => parts.push(...chunks);

  push(INIT);
  push(ALIGN_CENTER, BOLD_ON, text(receipt.merchantName), BOLD_OFF);
  push(text(`#${receipt.transactionNumber}`));
  push(text(new Date(receipt.createdAt).toLocaleString('id-ID')));
  if (receipt.memberName) {
    push(text(padLine('Member', receipt.memberNumber ? `${receipt.memberNumber}` : receipt.memberName)));
    if (receipt.memberNumber) {
      push(text(`  ${receipt.memberName}`));
    }
  }
  push(ALIGN_LEFT, line());

  for (const item of receipt.items) {
    push(text(item.name));
    const qty = `${item.quantity} ${item.unit}`;
    const price = `Rp ${currencyFormat(item.price)}`;
    push(text(padLine(`  ${qty}`, price)));
    if ((item.discountAmount ?? 0) > 0) {
      push(text(padLine('  Diskon', `-Rp ${currencyFormat(item.discountAmount!)}`)));
    }
    push(text(padLine('  Subtotal', `Rp ${currencyFormat(item.subtotal)}`)));
  }

  push(line());

  if ((receipt.subtotalAmount ?? 0) > 0 && receipt.subtotalAmount !== receipt.totalAmount) {
    push(text(padLine('Subtotal', `Rp ${currencyFormat(receipt.subtotalAmount!)}`)));
  }
  if ((receipt.discountAmount ?? 0) > 0) {
    push(text(padLine('Diskon', `-Rp ${currencyFormat(receipt.discountAmount!)}`)));
  }

  push(BOLD_ON, text(padLine('TOTAL', `Rp ${currencyFormat(receipt.totalAmount)}`)), BOLD_OFF);
  if (receipt.payments && receipt.payments.length > 0) {
    push(BOLD_ON, text('PEMBAYARAN'), BOLD_OFF);
    receipt.payments.forEach((payment) => {
      push(text(padLine(payment.methodName, `Rp ${currencyFormat(payment.tenderedAmount)}`)));
      if (payment.reference) push(text(`  Ref: ${payment.reference}`));
    });
  } else {
    const paymentMethodLabel = receipt.paymentMethodCode
      && receipt.paymentMethodCode.toUpperCase() !== receipt.paymentMethod.toUpperCase()
      ? `${receipt.paymentMethod} [${receipt.paymentMethodCode}]`
      : receipt.paymentMethod;
    push(text(padLine('Metode', paymentMethodLabel)));
    if (receipt.paymentReference) push(text(padLine('Referensi', receipt.paymentReference)));
  }
  push(text(padLine('Bayar', `Rp ${currencyFormat(receipt.paymentAmount)}`)));
  push(text(padLine('Kembali', `Rp ${currencyFormat(receipt.changeAmount)}`)));
  if (
    (receipt.membershipPointsEarned ?? 0) > 0 ||
    (receipt.membershipPointsRedeemed ?? 0) > 0
  ) {
    push(line());
    if ((receipt.membershipPointsRedeemed ?? 0) > 0) {
      push(text(padLine('Poin dipakai', `${receipt.membershipPointsRedeemed}`)));
    }
    if ((receipt.membershipPointsEarned ?? 0) > 0) {
      push(text(padLine('Poin didapat', `${receipt.membershipPointsEarned}`)));
    }
    if (receipt.membershipPointsBalanceAfter !== undefined) {
      push(text(padLine('Saldo poin', `${receipt.membershipPointsBalanceAfter}`)));
    }
  }

  push(line());
  push(ALIGN_CENTER, text(receipt.footer ?? 'Terima kasih'), ALIGN_LEFT);
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
      throw createPrinterError(
        'PRINTER_NOT_SELECTED',
        'Tidak ada port serial USB terdeteksi. Pastikan printer EPPOS menyala dan kabel USB tersambung.'
      );
    }

    return {
      name: printer.name,
      usbId: printer.usbId,
      portName: printer.portName,
      baudRate: 9600,
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
