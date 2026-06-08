import { useCallback, useState } from 'react';
import {
  SelectedUsbPrinter,
  clearStoredUsbPrinter,
  getStoredUsbPrinter,
  isWebSerialSupported,
  listUsbSerialPrinters,
  printReceiptUsb,
  requestUsbSerialPrinter,
  saveStoredUsbPrinter,
  testPrintUsb,
} from '@/utils/printer/usbSerialPrinter';
import { normalizePrinterError } from '@/utils/printer/bluetoothPrinter';
import { PrinterError, ReceiptPayload, UsbSerialPrinterDevice } from '@/types';

export const useUsbPrinter = () => {
  const [printers, setPrinters] = useState<UsbSerialPrinterDevice[]>([]);
  const [selectedPrinter, setSelectedPrinter] = useState<SelectedUsbPrinter | null>(
    getStoredUsbPrinter
  );
  const [isLoadingPrinters, setIsLoadingPrinters] = useState(false);
  const [isSelecting, setIsSelecting] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [lastError, setLastError] = useState<PrinterError | null>(null);

  const isSupported = isWebSerialSupported();

  const loadPrinters = useCallback(async () => {
    setIsLoadingPrinters(true);
    setLastError(null);

    try {
      const devices = await listUsbSerialPrinters();
      setPrinters(devices);
      return devices;
    } catch (error) {
      const err = normalizePrinterError(error);
      setLastError(err);
      throw err;
    } finally {
      setIsLoadingPrinters(false);
    }
  }, []);

  const selectPrinter = useCallback(async (device?: UsbSerialPrinterDevice) => {
    setIsSelecting(true);
    setLastError(null);
    try {
      const printer = device
        ? {
            name: device.name,
            usbId: device.usbId,
            portName: device.portName,
            baudRate: selectedPrinter?.baudRate ?? 9600,
          }
        : await requestUsbSerialPrinter();
      saveStoredUsbPrinter(printer);
      setSelectedPrinter(printer);
      return printer;
    } catch (error) {
      const err = normalizePrinterError(error);
      setLastError(err);
      throw err;
    } finally {
      setIsSelecting(false);
    }
  }, [selectedPrinter?.baudRate]);

  const clearPrinter = useCallback(() => {
    clearStoredUsbPrinter();
    setSelectedPrinter(null);
  }, []);

  const updateBaudRate = useCallback((baudRate: number) => {
    setSelectedPrinter((prev) => {
      if (!prev) return prev;
      const updated = { ...prev, baudRate };
      saveStoredUsbPrinter(updated);
      return updated;
    });
  }, []);

  const testPrint = useCallback(async () => {
    if (!selectedPrinter) {
      const err: PrinterError = { code: 'PRINTER_NOT_SELECTED', message: 'Printer belum dipilih.' };
      setLastError(err);
      throw err;
    }
    setIsTesting(true);
    setLastError(null);
    try {
      await testPrintUsb(selectedPrinter);
    } catch (error) {
      const err = normalizePrinterError(error);
      setLastError(err);
      throw err;
    } finally {
      setIsTesting(false);
    }
  }, [selectedPrinter]);

  const printReceipt = useCallback(
    async (receipt: ReceiptPayload) => {
      if (!selectedPrinter) {
        const err: PrinterError = { code: 'PRINTER_NOT_SELECTED', message: 'Printer belum dipilih.' };
        setLastError(err);
        throw err;
      }
      setIsPrinting(true);
      setLastError(null);
      try {
        await printReceiptUsb(selectedPrinter, receipt);
      } catch (error) {
        const err = normalizePrinterError(error);
        setLastError(err);
        throw err;
      } finally {
        setIsPrinting(false);
      }
    },
    [selectedPrinter]
  );

  return {
    printers,
    isSupported,
    selectedPrinter,
    isLoadingPrinters,
    isSelecting,
    isTesting,
    isPrinting,
    lastError,
    loadPrinters,
    selectPrinter,
    clearPrinter,
    updateBaudRate,
    testPrint,
    printReceipt,
  };
};
