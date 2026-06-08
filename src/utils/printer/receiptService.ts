import { db } from '@/lib/db';
import {
  PrinterError,
  ReceiptPayload,
  ReceiptPrintResult,
  ReceiptPrintStatus,
  TransactionReceiptInput,
} from '@/types';
import {
  getStoredBluetoothPrinter,
  normalizePrinterError,
  printReceiptBluetooth,
} from '@/utils/printer/bluetoothPrinter';
import {
  getStoredUsbPrinter,
  printReceiptUsb,
} from '@/utils/printer/usbSerialPrinter';

const DEFAULT_MERCHANT_NAME = 'Kasirku';
const DEFAULT_RECEIPT_FOOTER = 'Terima kasih';

const updateReceiptStatus = async (
  transactionId: string,
  status: ReceiptPrintStatus,
  error?: string
) => {
  try {
    await db.transactions.update(transactionId, {
      receipt_status: status,
      receipt_printed_at: status === 'printed' ? new Date().toISOString() : undefined,
      receipt_print_error: error || '',
    });
  } catch (dbError) {
    console.error('Failed to update receipt print status:', dbError);
  }
};

export const buildReceiptPayload = (transaction: TransactionReceiptInput): ReceiptPayload => ({
  transactionId: transaction.id,
  transactionNumber: transaction.transaction_number,
  merchantName: DEFAULT_MERCHANT_NAME,
  createdAt: transaction.created_at,
  paymentMethod: transaction.payment_method,
  items: transaction.items.map((item) => ({
    name: item.product_name,
    quantity: item.quantity,
    unit: item.unit,
    price: item.price,
    priceBeforeDiscount: item.price_before_discount,
    subtotalBeforeDiscount: item.subtotal_before_discount,
    discountAmount: item.discount_amount,
    subtotal: item.subtotal,
  })),
  subtotalAmount: transaction.subtotal_amount,
  discountAmount: transaction.discount_amount,
  discountBreakdown: transaction.discount_breakdown,
  totalAmount: transaction.total_amount,
  paymentAmount: transaction.payment_amount,
  changeAmount: transaction.change_amount,
  footer: DEFAULT_RECEIPT_FOOTER,
});

export const printReceiptAfterTransaction = async (
  transaction: TransactionReceiptInput
): Promise<ReceiptPrintResult> => {
  const receipt = buildReceiptPayload(transaction);

  // Try USB printer first, then fall back to Bluetooth
  const usbPrinter = getStoredUsbPrinter();
  if (usbPrinter) {
    try {
      await printReceiptUsb(usbPrinter, receipt);
      await updateReceiptStatus(transaction.id, 'printed');
      return { success: true, status: 'printed' };
    } catch (error) {
      const printerError: PrinterError = normalizePrinterError(error);
      await updateReceiptStatus(transaction.id, 'print_failed', printerError.message);
      return { success: false, status: 'print_failed', error: printerError.message };
    }
  }

  const bluetoothPrinter = getStoredBluetoothPrinter();
  if (!bluetoothPrinter) {
    const message = 'Printer belum dipilih (Bluetooth maupun USB).';
    await updateReceiptStatus(transaction.id, 'print_failed', message);
    return { success: false, status: 'print_failed', error: message };
  }

  try {
    await printReceiptBluetooth(bluetoothPrinter, receipt);
    await updateReceiptStatus(transaction.id, 'printed');
    return { success: true, status: 'printed' };
  } catch (error) {
    const printerError: PrinterError = normalizePrinterError(error);
    await updateReceiptStatus(transaction.id, 'print_failed', printerError.message);
    return { success: false, status: 'print_failed', error: printerError.message };
  }
};

