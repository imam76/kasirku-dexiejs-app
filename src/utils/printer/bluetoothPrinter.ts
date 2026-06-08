import { invoke } from '@tauri-apps/api/core';
import {
  BluetoothPrinterDevice,
  PrinterError,
  PrinterErrorCode,
  ReceiptPayload,
  SelectedBluetoothPrinter,
} from '@/types';

const SELECTED_PRINTER_STORAGE_KEY = 'kasirku-selected-bluetooth-printer';

type TauriWindow = Window & {
  __TAURI_INTERNALS__?: unknown;
};

export const isNativeTauri = () => {
  if (typeof window === 'undefined') {
    return false;
  }

  return Boolean((window as TauriWindow).__TAURI_INTERNALS__);
};

const createPrinterError = (code: PrinterErrorCode, message: string): PrinterError => ({
  code,
  message,
});

const unsupportedPlatformError = () =>
  createPrinterError(
    'UNSUPPORTED_PLATFORM',
    'Auto print Bluetooth hanya tersedia di aplikasi native Android.'
  );

export const normalizePrinterError = (error: unknown): PrinterError => {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    'message' in error
  ) {
    const candidate = error as { code?: string; message?: string };

    return {
      code: (candidate.code || 'UNKNOWN') as PrinterErrorCode,
      message: candidate.message || 'Terjadi kesalahan printer.',
    };
  }

  if (error instanceof Error) {
    return createPrinterError('UNKNOWN', error.message);
  }

  if (typeof error === 'string') {
    return createPrinterError('UNKNOWN', error);
  }

  return createPrinterError('UNKNOWN', 'Terjadi kesalahan printer.');
};

export const getStoredBluetoothPrinter = (): SelectedBluetoothPrinter | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  const value = localStorage.getItem(SELECTED_PRINTER_STORAGE_KEY);
  if (!value) {
    return null;
  }

  try {
    const printer = JSON.parse(value) as Partial<SelectedBluetoothPrinter>;
    const name = printer.name?.trim();
    const address = printer.address?.trim();

    if (!name || !address) {
      clearStoredBluetoothPrinter();
      return null;
    }

    return {
      name,
      address,
    };
  } catch {
    clearStoredBluetoothPrinter();
    return null;
  }
};

export const saveStoredBluetoothPrinter = (printer: SelectedBluetoothPrinter) => {
  localStorage.setItem(
    SELECTED_PRINTER_STORAGE_KEY,
    JSON.stringify({
      name: printer.name.trim(),
      address: printer.address.trim(),
    })
  );
};

export const clearStoredBluetoothPrinter = () => {
  localStorage.removeItem(SELECTED_PRINTER_STORAGE_KEY);
};

export const listBluetoothPrinters = async (): Promise<BluetoothPrinterDevice[]> => {
  if (!isNativeTauri()) {
    throw unsupportedPlatformError();
  }

  try {
    return await invoke<BluetoothPrinterDevice[]>('list_bluetooth_printers');
  } catch (error) {
    throw normalizePrinterError(error);
  }
};

export const testPrintBluetooth = async (printer: SelectedBluetoothPrinter) => {
  if (!isNativeTauri()) {
    throw unsupportedPlatformError();
  }

  try {
    await invoke('test_print_bluetooth', { printer });
  } catch (error) {
    throw normalizePrinterError(error);
  }
};

export const printReceiptBluetooth = async (
  printer: SelectedBluetoothPrinter,
  receipt: ReceiptPayload
) => {
  if (!isNativeTauri()) {
    throw unsupportedPlatformError();
  }

  try {
    await invoke('print_receipt_bluetooth', { printer, receipt });
  } catch (error) {
    throw normalizePrinterError(error);
  }
};

export const assertPrinterSelected = (
  printer: SelectedBluetoothPrinter | null
): SelectedBluetoothPrinter => {
  if (!printer) {
    throw createPrinterError('PRINTER_NOT_SELECTED', 'Printer belum dipilih.');
  }

  if (!printer.address.trim()) {
    throw createPrinterError(
      'PRINTER_NOT_SELECTED',
      'Alamat Bluetooth printer belum terbaca. Muat ulang perangkat paired lalu pilih printer lagi.'
    );
  }

  return {
    name: printer.name.trim(),
    address: printer.address.trim(),
  };
};
