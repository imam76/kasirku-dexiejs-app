import { useRef, useEffect, useState, useLayoutEffect } from 'react';
import { Receipt, ChevronDown, ChevronUp } from 'lucide-react';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import { useHistory } from '@/hooks/useHistory';
import { formatDate, formatCurrency } from '@/utils/formatters';

export default function History() {
  const {
    transactions,
    expandedId,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    isError,
    error,
    toggleExpand,
    loadMore
  } = useHistory();
  const parentRef = useRef<HTMLDivElement>(null);
  const [scrollMargin, setScrollMargin] = useState(0);

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

  return (
    <div className="p-4 sm:p-6 min-h-screen bg-gray-50">
      <div className="flex items-center gap-3 mb-6">
        <Receipt size={32} className="text-blue-600" />
        <h2 className="text-2xl font-bold text-gray-800">Riwayat Transaksi</h2>
      </div>

      <div ref={parentRef} className="w-full">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center p-12 gap-4 bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
            <p className="text-gray-500 font-medium">Memuat riwayat...</p>
          </div>
        ) : isError ? (
          <div className="p-12 text-center bg-white rounded-lg shadow-sm border border-red-200">
            <p className="text-red-600 font-medium">Terjadi kesalahan:</p>
            <p className="text-gray-500 text-sm mt-1">{(error as Error)?.message || 'Gagal memuat riwayat transaksi'}</p>
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
                      className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden"
                    >
                      <div
                        onClick={() => toggleExpand(transaction.id)}
                        className="p-4 cursor-pointer hover:bg-gray-50 transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <span className="font-mono text-sm bg-blue-100 text-blue-800 px-3 py-1 rounded">
                                {transaction.transaction_number}
                              </span>
                              <span className="text-sm text-gray-600">
                                {formatDate(transaction.created_at)}
                              </span>
                            </div>
                            <div className="grid grid-cols-4 gap-4">
                              <div>
                                <p className="text-xs text-gray-500">Total</p>
                                <p className="font-bold text-gray-800">
                                  Rp {formatCurrency(transaction.total_amount)}
                                </p>
                              </div>
                              <div>
                                <p className="text-xs text-gray-500">Bayar</p>
                                <p className="font-semibold text-gray-700">
                                  Rp {formatCurrency(transaction.payment_amount)}
                                </p>
                              </div>
                              <div>
                                <p className="text-xs text-gray-500">Kembali</p>
                                <p className="font-semibold text-gray-700">
                                  Rp {formatCurrency(transaction.change_amount)}
                                </p>
                              </div>
                              <div>
                                <p className="text-xs text-gray-500">Profit</p>
                                {(() => {
                                  const totalProfit = transaction.items?.reduce((sum, item) => sum + (item.profit || 0), 0) || 0;
                                  return (
                                    <p className={`font-bold ${totalProfit > 0 ? 'text-green-700' : totalProfit < 0 ? 'text-red-700' : 'text-gray-700'}`}>
                                      Rp {formatCurrency(totalProfit)}
                                    </p>
                                  );
                                })()}
                              </div>
                            </div>
                          </div>
                          <div>
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
                          <h4 className="font-semibold text-gray-700 mb-3">Detail Item:</h4>
                          <div className="space-y-2">
                            {transaction.items.map((item) => (
                              <div
                                key={item.id}
                                className="bg-white p-3 rounded border border-gray-200"
                              >
                                <div className="flex justify-between items-start mb-2">
                                  <div>
                                    <p className="font-medium text-gray-800">{item.product_name}</p>
                                    <p className="text-sm text-gray-600">
                                      {item.quantity} x Rp {formatCurrency(item.price)} = Rp {formatCurrency(item.subtotal)}
                                    </p>
                                  </div>
                                  <p className="font-bold text-gray-800">
                                    Rp {formatCurrency(item.subtotal)}
                                  </p>
                                </div>
                                <div className="grid grid-cols-3 gap-2 text-xs pt-2 border-t border-gray-100">
                                  <div>
                                    <p className="text-gray-500">Beli</p>
                                    <p className="font-semibold text-gray-700">Rp {formatCurrency(item.purchase_price)}</p>
                                  </div>
                                  <div>
                                    <p className="text-gray-500">Jual</p>
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
                      Memuat lebih banyak...
                    </>
                  ) : (
                    'Muat Lebih Banyak'
                  )}
                </button>
              </div>
            )}
            {!hasNextPage && transactions.length > 0 && (
              <p className="text-center text-gray-400 text-sm mt-8 pb-12">
                Semua transaksi telah ditampilkan
              </p>
            )}
          </>
        ) : (
          <div className="p-12 text-center">
            <Receipt size={48} className="mx-auto text-gray-400 mb-4" />
            <p className="text-gray-500">Belum ada transaksi</p>
          </div>
        )}
      </div>
    </div>
  );
}
