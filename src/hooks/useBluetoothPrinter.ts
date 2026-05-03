import { useCallback, useState } from 'react';
import {
  assertPrinterSelected,
  clearStoredBluetoothPrinter,
  getStoredBluetoothPrinter,
  listBluetoothPrinters,
  normalizePrinterError,
  printReceiptBluetooth,
  saveStoredBluetoothPrinter,
  testPrintBluetooth,
} from '@/utils/printer/bluetoothPrinter';
import {
  BluetoothPrinterDevice,
  PrinterError,
  PrinterErrorCode,
  ReceiptPayload,
  SelectedBluetoothPrinter,
} from '@/types';

const createPrinterError = (code: PrinterErrorCode, message: string): PrinterError => ({
  code,
  message,
});

export const useBluetoothPrinter = () => {
  const [printers, setPrinters] = useState<BluetoothPrinterDevice[]>([]);
  const [selectedPrinter, setSelectedPrinter] = useState<SelectedBluetoothPrinter | null>(
    getStoredBluetoothPrinter
  );
  const [isLoadingPrinters, setIsLoadingPrinters] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [lastError, setLastError] = useState<PrinterError | null>(null);

  const loadPrinters = useCallback(async () => {
    setIsLoadingPrinters(true);
    setLastError(null);

    try {
      const devices = await listBluetoothPrinters();
      const pairedDevices = devices.filter((device) => device.address.trim());
      setPrinters(pairedDevices);
      return pairedDevices;
    } catch (error) {
      const printerError = normalizePrinterError(error);
      setLastError(printerError);
      throw printerError;
    } finally {
      setIsLoadingPrinters(false);
    }
  }, []);

  const selectPrinter = useCallback((printer: SelectedBluetoothPrinter) => {
    if (!printer.address.trim()) {
      setLastError(
        createPrinterError(
          'PRINTER_NOT_SELECTED',
          'Alamat Bluetooth printer belum terbaca. Muat ulang perangkat paired lalu pilih printer lagi.'
        )
      );
      return false;
    }

    saveStoredBluetoothPrinter(printer);
    setSelectedPrinter({
      name: printer.name.trim(),
      address: printer.address.trim(),
    });
    setLastError(null);
    return true;
  }, []);

  const clearPrinter = useCallback(() => {
    clearStoredBluetoothPrinter();
    setSelectedPrinter(null);
  }, []);

  const testPrint = useCallback(async () => {
    setIsTesting(true);
    setLastError(null);

    try {
      await testPrintBluetooth(assertPrinterSelected(selectedPrinter));
    } catch (error) {
      const printerError = normalizePrinterError(error);
      setLastError(printerError);
      throw printerError;
    } finally {
      setIsTesting(false);
    }
  }, [selectedPrinter]);

  const printReceipt = useCallback(
    async (receipt: ReceiptPayload) => {
      setIsPrinting(true);
      setLastError(null);

      try {
        await printReceiptBluetooth(assertPrinterSelected(selectedPrinter), receipt);
      } catch (error) {
        const printerError = normalizePrinterError(error);
        setLastError(printerError);
        throw printerError;
      } finally {
        setIsPrinting(false);
      }
    },
    [selectedPrinter]
  );

  return {
    printers,
    selectedPrinter,
    isLoadingPrinters,
    isTesting,
    isPrinting,
    lastError,
    loadPrinters,
    selectPrinter,
    clearPrinter,
    testPrint,
    printReceipt,
  };
};
