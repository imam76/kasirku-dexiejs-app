import { useRef, useEffect, useState, useLayoutEffect } from 'react';
import { App, Input } from 'antd';
import { Receipt, ChevronDown, ChevronUp, Wallet, DollarSign, Printer, AlertCircle, CheckCircle2, Ban } from 'lucide-react';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import { useHistory } from '@/hooks/useHistory';
import { useI18n } from '@/hooks/useI18n';
import { formatDate, formatCurrency } from '@/utils/formatters';
import { printReceiptAfterTransaction } from '@/utils/printer/receiptService';
import { resolveTransactionItemUnit } from '@/utils/salesUnits';
import { getTransactionProfit, isTransactionVoided } from '@/utils/transactions';
import { Transaction, TransactionItem, TransactionReceiptInput } from '@/types';

interface TransactionWithItems extends Transaction {
  items?: TransactionItem[];
}

export default function History() {
  const { message, modal } = App.useApp();
  const { t } = useI18n();
  const {
    transactions,
    expandedId,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    isError,
    error,
    toggleExpand,
    loadMore,
    refetch,
    voidTransaction,
    isVoiding,
  } = useHistory();
  const parentRef = useRef<HTMLDivElement>(null);
  const [scrollMargin, setScrollMargin] = useState(0);
  const [reprintingId, setReprintingId] = useState<string | null>(null);
  const [voidingId, setVoidingId] = useState<string | null>(null);

  useLayoutEffect(() => {
    if (parentRef.current) {
      setScrollMargin(parentRef.current.offsetTop);
    }
  }, []);

  const rowVirtualizer = useWindowVirtualizer({
    count: transactions.length,
    estimateSize: () => 120,
    overscan: 5,
    scrollMargin,
  });

  // Load more when reaching the end
  useEffect(() => {
    const virtualItems = rowVirtualizer.getVirtualItems();
    const lastItem = virtualItems[virtualItems.length - 1];
    if (!lastItem) return;

    if (
      lastItem.index >= transactions.length - 1 &&
      hasNextPage &&
      !isFetchingNextPage
    ) {
      loadMore();
    }
  }, [
    hasNextPage,
    isFetchingNextPage,
    loadMore,
    transactions.length,
    rowVirtualizer,
  ]);

  // Re-measure when expansion state changes
  useEffect(() => {
    rowVirtualizer.measure();
  }, [expandedId, rowVirtualizer]);

  const handleReprint = async (transaction: TransactionWithItems) => {
    if (isTransactionVoided(transaction)) {
      message.warning(t('history.voidedPrintBlocked'));
      return;
    }

    if (!transaction.items) {
      message.warning(t('history.itemsNotReady'));
      return;
    }

    try {
      setReprintingId(transaction.id);
      const result = await printReceiptAfterTransaction(transaction as TransactionReceiptInput);
      await refetch();

      if (result.success) {
        message.success(
          transaction.receipt_status === 'printed'
            ? t('history.reprintSuccess')
            : t('history.printSuccess')
        );
        return;
      }

      message.warning(result.error || t('history.reprintFailed'));
    } finally {
      setReprintingId(null);
    }
  };

  const handleVoid = (transaction: TransactionWithItems) => {
    let reason = '';

    modal.confirm({
      title: t('history.voidTitle'),
      content: (
        <div className="space-y-3">
          <p className="text-sm text-gray-600">{t('history.voidContent')}</p>
          <Input.TextArea
            rows={3}
            maxLength={160}
            showCount
            placeholder={t('history.voidReasonPlaceholder')}
            onChange={(event) => {
              reason = event.target.value;
            }}
          />
        </div>
      ),
      okText: t('history.voidOk'),
      cancelText: t('common.cancel'),
      okType: 'danger',
      onOk: async () => {
        try {
          setVoidingId(transaction.id);
          await voidTransaction({
            transactionId: transaction.id,
            reason: reason.trim() || t('history.voidDefaultReason'),
          });
          await refetch();
          message.success(t('history.voidSuccess'));
        } catch (error) {
          modal.error({
            title: t('history.voidFailedTitle'),
            content: error instanceof Error ? error.message : t('history.voidFailedContent'),
          });
        } finally {
          setVoidingId(null);
        }
      },
    });
  };

  const getPrintActionLabel = (transaction: TransactionWithItems) => {
    if (reprintingId === transaction.id) {
      return t('history.printing');
    }

    if (transaction.receipt_status === 'printed') {
      return t('history.reprint');
    }

    if (transaction.receipt_status === 'pending') {
      return t('history.printReceipt');
    }

    return t('history.reprint');
  };

  return (
    <div className="p-4 sm:p-6 min-h-screen bg-gray-50">
      <div className="flex items-center gap-3 mb-6" data-tour="history-results">
        <Receipt size={32} className="text-blue-600" />
        <h2 className="text-2xl font-bold text-gray-800">{t('history.title')}</h2>
      </div>

      <div ref={parentRef} className="w-full">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center p-12 gap-4 bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
            <p className="text-gray-500 font-medium">{t('history.loading')}</p>
          </div>
        ) : isError ? (
          <div className="p-12 text-center bg-white rounded-lg shadow-sm border border-red-200">
            <p className="text-red-600 font-medium">{t('history.errorTitle')}</p>
            <p className="text-gray-500 text-sm mt-1">{(error as Error)?.message || t('history.errorFallback')}</p>
          </div>
        ) : transactions.length > 0 ? (
          <>
            <div
              style={{
                height: `${rowVirtualizer.getTotalSize()}px`,
                width: '100%',
                position: 'relative',
              }}
            >
              {rowVirtualizer.getVirtualItems().map((virtualItem) => {
                const transaction = transactions[virtualItem.index];
                if (!transaction) return null;
                const isVoided = isTransactionVoided(transaction);

                return (
                  <div
                    key={virtualItem.key}
                    data-index={virtualItem.index}
                    ref={rowVirtualizer.measureElement}
                    className="absolute top-0 left-0 w-full pb-4"
                    style={{
                      transform: `translateY(${virtualItem.start - rowVirtualizer.options.scrollMargin}px)`,
                    }}
                  >
                    <div
                      className={`bg-white rounded-lg shadow-md border overflow-hidden ${
                        isVoided ? 'border-red-200' : 'border-gray-200'
                      }`}
                    >
                      <div
                        onClick={() => toggleExpand(transaction.id)}
                        className={`p-4 cursor-pointer transition-colors ${
                          isVoided ? 'bg-red-50/60 hover:bg-red-50' : 'hover:bg-gray-50'
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            {/* Badge row: wrap supaya tidak overflow di mobile */}
                            <div className="flex flex-wrap items-center gap-2 mb-1">
                              <span className="font-mono text-sm bg-blue-100 text-blue-800 px-3 py-1 rounded">
                                {transaction.transaction_number}
                              </span>
                              {isVoided && (
                                <span className="text-xs px-2 py-1 rounded flex items-center gap-1 font-semibold bg-red-100 text-red-700">
                                  <Ban size={12} />
                                  {t('history.voidedBadge')}
                                </span>
                              )}
                              <span className={`text-xs px-2 py-1 rounded flex items-center gap-1 font-semibold ${
                                transaction.payment_method === 'NON_TUNAI'
                                  ? 'bg-indigo-100 text-indigo-700'
                                  : 'bg-green-100 text-green-700'
                              }`}>
                                {transaction.payment_method === 'NON_TUNAI' ? (
                                  <>
                                    <Wallet size={12} />
                                    {t('payment.nonCash').toUpperCase()}
                                  </>
                                ) : (
                                  <>
                                    <DollarSign size={12} />
                                    {t('payment.cash').toUpperCase()}
                                  </>
                                )}
                              </span>
                              {transaction.receipt_status === 'printed' && (
                                <span className="text-xs px-2 py-1 rounded flex items-center gap-1 font-semibold bg-emerald-100 text-emerald-700">
                                  <CheckCircle2 size={12} />
                                  {t('history.receiptPrintedBadge')}
                                </span>
                              )}
                              {transaction.receipt_status === 'print_failed' && (
                                <span className="text-xs px-2 py-1 rounded flex items-center gap-1 font-semibold bg-red-100 text-red-700">
                                  <AlertCircle size={12} />
                                  {t('history.printFailedBadge')}
                                </span>
                              )}
                              {transaction.receipt_status === 'pending' && (
                                <span className="text-xs px-2 py-1 rounded flex items-center gap-1 font-semibold bg-yellow-100 text-yellow-700">
                                  <Printer size={12} />
                                  {t('history.printPendingBadge')}
                                </span>
                              )}
                            </div>
                            {/* Tanggal di baris sendiri */}
                            <p className="text-sm text-gray-600 mb-2">
                              {formatDate(transaction.created_at)}
                            </p>
                            {/* Summary: 2 col di mobile, 4 col di sm+ */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2">
                              <div>
                                <p className="text-xs text-gray-500">{t('common.total')}</p>
                                <p className={`font-bold ${isVoided ? 'text-gray-500 line-through' : 'text-gray-800'}`}>
                                  Rp {formatCurrency(transaction.total_amount)}
                                </p>
                              </div>
                              <div>
                                <p className="text-xs text-gray-500">{t('history.paid')}</p>
                                <p className="font-semibold text-gray-700">
                                  Rp {formatCurrency(transaction.payment_amount)}
                                </p>
                              </div>
                              <div>
                                <p className="text-xs text-gray-500">{t('history.change')}</p>
                                <p className="font-semibold text-gray-700">
                                  Rp {formatCurrency(transaction.change_amount)}
                                </p>
                              </div>
                              <div>
                                <p className="text-xs text-gray-500">Profit</p>
                                {(() => {
                                  const totalProfit = transaction.items ? getTransactionProfit(transaction.items) : 0;
                                  return (
                                    <p className={`font-bold ${isVoided ? 'text-gray-500 line-through' : totalProfit > 0 ? 'text-green-700' : totalProfit < 0 ? 'text-red-700' : 'text-gray-700'}`}>
                                      Rp {formatCurrency(totalProfit)}
                                    </p>
                                  );
                                })()}
                              </div>
                            </div>
                          </div>
                          {/* Chevron tidak ikut terdesak */}
                          <div className="shrink-0 ml-2 mt-1">
                            {expandedId === transaction.id ? (
                              <ChevronUp className="text-gray-400" />
                            ) : (
                              <ChevronDown className="text-gray-400" />
                            )}
                          </div>
                        </div>
                      </div>

                      {expandedId === transaction.id && transaction.items && (
                        <div className="border-t bg-gray-50 p-4">
                          <h4 className="font-semibold text-gray-700 mb-3">{t('history.itemDetails')}</h4>
                          {isVoided && (
                            <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                              <p className="font-semibold">{t('history.voidedNotice')}</p>
                              {transaction.void_reason && (
                                <p className="mt-1">{transaction.void_reason}</p>
                              )}
                            </div>
                          )}
                          <div className="space-y-2">
                            {transaction.items.map((item) => (
                              <div
                                key={item.id}
                                className="bg-white p-3 rounded border border-gray-200"
                              >
                                <div className="flex justify-between items-start mb-2">
                                  <div className="min-w-0 flex-1 pr-2">
                                    <p className="font-medium text-gray-800">{item.product_name}</p>
                                    <p className="text-sm text-gray-600">
                                      {item.quantity} {resolveTransactionItemUnit(item)} x Rp {formatCurrency(item.price)} = Rp {formatCurrency(item.subtotal)}
                                    </p>
                                  </div>
                                  <p className="font-bold text-gray-800 shrink-0">
                                    Rp {formatCurrency(item.subtotal)}
                                  </p>
                                </div>
                                <div className="grid grid-cols-3 gap-2 text-xs pt-2 border-t border-gray-100">
                                  <div>
                                    <p className="text-gray-500">{t('history.purchase')}</p>
                                    <p className="font-semibold text-gray-700">Rp {formatCurrency(item.purchase_price)}</p>
                                  </div>
                                  <div>
                                    <p className="text-gray-500">{t('history.sell')}</p>
                                    <p className="font-semibold text-gray-700">Rp {formatCurrency(item.price)}</p>
                                  </div>
                                  <div>
                                    <p className="text-gray-500">Profit</p>
                                    <p className={`font-semibold ${item.profit > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                      Rp {formatCurrency(item.profit)}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                          <div className={`mt-4 rounded-lg border p-3 ${
                            isVoided
                              ? 'border-red-200 bg-red-50'
                              : transaction.receipt_status === 'print_failed'
                              ? 'border-red-200 bg-red-50'
                              : 'border-gray-200 bg-white'
                          }`}>
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                              <div>
                                <p className={`font-semibold ${
                                  transaction.receipt_status === 'print_failed'
                                    ? 'text-red-700'
                                    : 'text-gray-700'
                                }`}>
                                  {isVoided
                                    ? t('history.voidedReceiptBlocked')
                                    : transaction.receipt_status === 'print_failed'
                                    ? t('history.receiptNotPrinted')
                                    : t('history.receiptPrint')}
                                </p>
                                <p className={`text-sm ${
                                  transaction.receipt_status === 'print_failed'
                                    ? 'text-red-600'
                                    : 'text-gray-500'
                                }`}>
                                  {isVoided
                                    ? t('history.voidedReceiptBlockedDescription')
                                    : transaction.receipt_status === 'print_failed'
                                    ? transaction.receipt_print_error || t('history.checkPrinter')
                                    : transaction.receipt_status === 'printed'
                                      ? t('history.receiptAlreadyPrinted')
                                      : t('history.receiptNotYetPrinted')}
                                </p>
                              </div>
                              {!isVoided && (
                                <button
                                  type="button"
                                  onClick={() => handleReprint(transaction)}
                                  disabled={reprintingId === transaction.id}
                                  className={`px-4 py-2 rounded-lg font-semibold transition-colors flex items-center justify-center gap-2 disabled:opacity-60 ${
                                    transaction.receipt_status === 'print_failed'
                                      ? 'bg-red-600 hover:bg-red-700 text-white'
                                      : 'bg-blue-600 hover:bg-blue-700 text-white'
                                  }`}
                                >
                                  <Printer size={16} />
                                  {getPrintActionLabel(transaction)}
                                </button>
                              )}
                            </div>
                          </div>
                          {!isVoided && (
                            <div className="mt-3 flex justify-end">
                              <button
                                type="button"
                                onClick={() => handleVoid(transaction)}
                                disabled={isVoiding || voidingId === transaction.id}
                                className="flex items-center justify-center gap-2 rounded-lg border border-red-200 bg-white px-4 py-2 font-semibold text-red-600 transition-colors hover:bg-red-50 disabled:opacity-60"
                              >
                                <Ban size={16} />
                                {voidingId === transaction.id ? t('history.voiding') : t('history.voidAction')}
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Load More Indicator */}
            {hasNextPage && (
              <div className="mt-8 flex justify-center pb-12">
                <button
                  onClick={() => loadMore()}
                  disabled={isFetchingNextPage}
                  className="px-6 py-2 bg-white border border-gray-300 rounded-full shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 flex items-center gap-2"
                >
                  {isFetchingNextPage ? (
                    <>
                      <div className="w-4 h-4 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin"></div>
                      {t('history.loadingMore')}
                    </>
                  ) : (
                    t('history.loadMore')
                  )}
                </button>
              </div>
            )}
            {!hasNextPage && transactions.length > 0 && (
              <p className="text-center text-gray-400 text-sm mt-8 pb-12">
                {t('history.allShown')}
              </p>
            )}
          </>
        ) : (
          <div className="p-12 text-center">
            <Receipt size={48} className="mx-auto text-gray-400 mb-4" />
            <p className="text-gray-500">{t('history.empty')}</p>
          </div>
        )}
      </div>
    </div>
  );
}
