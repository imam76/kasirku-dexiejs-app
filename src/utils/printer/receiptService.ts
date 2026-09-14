import { db } from '@/lib/db';
import {
  PrinterError,
  ReceiptPayload,
  ReceiptPaperSize,
  ReceiptPrintResult,
  ReceiptPrintStatus,
  TransactionReceiptInput,
} from '@/types';
import { buildTransactionBundleOutboxItem, schedulePendingSyncQueue } from '@/services/syncQueueService';
import {
  getStoredBluetoothPrinter,
  normalizePrinterError,
  printReceiptBluetooth,
} from '@/utils/printer/bluetoothPrinter';
import {
  getStoredUsbPrinter,
  printReceiptUsb,
} from '@/utils/printer/usbSerialPrinter';
import { getTransactionPaymentSnapshot } from '@/utils/posPaymentMethod';
import { getTransactionPaymentsOrLegacyFallback } from '@/utils/posSplitPayment';
import { getStoredReceiptPaperSize } from '@/utils/printer/receiptPaperSize';
import { isTransactionExpense } from '@/utils/transactions';
import { createPosPerformanceTrace, type PosPerformanceTrace } from '@/utils/posPerformance';

const DEFAULT_MERCHANT_NAME = 'Frayukti';
const DEFAULT_RECEIPT_FOOTER = 'Terima kasih';

interface ReceiptPrintOptions {
  openCashDrawer?: boolean;
  performanceTrace?: PosPerformanceTrace;
  /** Called in a later task after transport starts, including failed/no-printer paths. */
  onPrintDispatched?: () => void;
}

const updateReceiptStatus = async (
  transactionId: string,
  status: ReceiptPrintStatus,
  error?: string
) => {
  try {
    const now = new Date().toISOString();
    await db.transaction('rw', [db.transactions, db.transactionItems, db.syncQueue], async () => {
      await db.transactions.update(transactionId, {
        receipt_status: status,
        receipt_printed_at: status === 'printed' ? now : undefined,
        receipt_print_error: error || '',
        updated_at: now,
        sync_status: 'pending',
        sync_error: undefined,
      });

      const transaction = await db.transactions.get(transactionId);
      if (transaction) {
        const items = await db.transactionItems.where('transaction_id').equals(transactionId).toArray();
        await db.syncQueue.add(buildTransactionBundleOutboxItem(transaction, items, 'update', now));
      }
    });
    schedulePendingSyncQueue();
  } catch (dbError) {
    console.error('Failed to update receipt print status:', dbError);
  }
};

export const buildReceiptPayload = (
  transaction: TransactionReceiptInput,
  merchantName = DEFAULT_MERCHANT_NAME,
  paperSize: ReceiptPaperSize = getStoredReceiptPaperSize(),
  options: ReceiptPrintOptions = {},
): ReceiptPayload => {
  const payment = getTransactionPaymentSnapshot(transaction);
  const payments = getTransactionPaymentsOrLegacyFallback(transaction, transaction.payments);
  return {
    transactionId: transaction.id,
    transactionNumber: transaction.transaction_number,
    merchantName: merchantName.trim() || DEFAULT_MERCHANT_NAME,
    paperSize,
    createdAt: transaction.created_at,
    paymentMethod: payments.length > 1 ? 'Split Payment' : payment.name,
    paymentMethodCode: payments.length > 1 ? 'SPLIT' : payment.code,
    paymentReference: payments.length > 1 ? undefined : payment.reference,
    payments: payments.map((item) => ({
      methodName: item.payment_method_name,
      methodCode: item.payment_method_code,
      reference: item.payment_reference,
      tenderedAmount: item.tendered_amount,
      appliedAmount: item.applied_amount,
      changeAmount: item.change_amount,
    })),
    memberName: transaction.member_name,
    memberNumber: transaction.member_number,
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
    lotteryNumber: transaction.lottery_number,
    membershipPointsEarned: transaction.membership_points_earned,
    membershipPointsRedeemed: transaction.membership_points_redeemed,
    membershipPointDiscountAmount: transaction.membership_point_discount_amount,
    membershipPointsBalanceAfter: transaction.membership_points_balance_after,
    totalAmount: transaction.total_amount,
    paymentAmount: transaction.payment_amount,
    changeAmount: transaction.change_amount,
    openCashDrawer: Boolean(
      options.openCashDrawer
      && payments.some((item) => item.payment_method_category === 'CASH')
    ),
    footer: DEFAULT_RECEIPT_FOOTER,
  };
};

export const printReceiptAfterTransaction = async (
  transaction: TransactionReceiptInput,
  options: ReceiptPrintOptions = {},
): Promise<ReceiptPrintResult> => {
  const trace = options.performanceTrace ?? createPosPerformanceTrace();
  trace.checkpoint('print_start');
  let dispatched = false;
  const notifyDispatched = () => {
    if (dispatched) return;
    dispatched = true;
    setTimeout(() => {
      try {
        options.onPrintDispatched?.();
      } catch (error) {
        console.error('Post-receipt refresh failed:', error);
      } finally {
        schedulePendingSyncQueue();
      }
    }, 0);
  };

  try {
    if (isTransactionExpense(transaction)) {
      return {
        success: false,
        status: 'print_failed',
        error: 'Pengeluaran internal tidak memiliki struk penjualan.',
      };
    }
    const companyProfile = await db.companyProfileSetting.get('default');
    const receipt = buildReceiptPayload(
      transaction,
      companyProfile?.company_name,
      getStoredReceiptPaperSize(),
      options,
    );

    trace.checkpoint('receipt_prepare');
    // Use the selected USB printer when present, otherwise use Bluetooth.
    const usbPrinter = getStoredUsbPrinter();
    const bluetoothPrinter = usbPrinter ? null : getStoredBluetoothPrinter();
    if (!usbPrinter && !bluetoothPrinter) {
      const message = 'Printer belum dipilih (Bluetooth maupun USB).';
      notifyDispatched();
      await updateReceiptStatus(transaction.id, 'print_failed', message);
      trace.checkpoint('receipt_status');
      trace.report('printer_not_selected');
      return { success: false, status: 'print_failed', error: message };
    }

    try {
      const printing = usbPrinter
        ? printReceiptUsb(usbPrinter, receipt)
        : printReceiptBluetooth(bluetoothPrinter!, receipt);
      notifyDispatched();
      await printing;
      trace.checkpoint('printer_transport');
      await updateReceiptStatus(transaction.id, 'printed');
      trace.checkpoint('receipt_status');
      trace.report('receipt_printed');
      return { success: true, status: 'printed' };
    } catch (error) {
      const printerError: PrinterError = normalizePrinterError(error);
      trace.checkpoint('printer_transport_failed');
      await updateReceiptStatus(transaction.id, 'print_failed', printerError.message);
      trace.checkpoint('receipt_status');
      trace.report('receipt_failed');
      return { success: false, status: 'print_failed', error: printerError.message };
    }
  } finally {
    // A preparation error must not strand committed checkout outbox rows.
    notifyDispatched();
  }
};
