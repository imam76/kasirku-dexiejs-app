import { useEffect, useMemo, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { App } from 'antd';
import { db } from '@/lib/db';
import { useTransactionStore } from '@/store/transactionStore';
import { Transaction, TransactionItem, Product } from '@/types';
import { formatCurrency } from '@/utils/formatters';
import { getPrice, normalisasiHargaProduk, konversiSatuanProduk } from '@/utils/pricing';
import { printReceiptAfterTransaction } from '@/utils/printer/receiptService';
import { createSalesUnitSnapshot } from '@/utils/salesUnits';

export const useTransaction = () => {
  const queryClient = useQueryClient();
  const { modal, message } = App.useApp();
  const {
    products,
    cart,
    searchTerm,
    paymentAmount,
    paymentMethod,
    showPayment,
    setProducts,
    setSearchTerm,
    setPaymentAmount,
    setPaymentMethod,
    setShowPayment,
    addToCart: storeAddToCart,
    updateQuantity: storeUpdateQuantity,
    removeFromCart,
    reset,
  } = useTransactionStore();

  const loadProducts = useCallback(async () => {
    try {
      const data = await db.products.orderBy('name').toArray();
      setProducts(data);
    } catch (error) {
      console.error('Failed to load products:', error);
    }
  }, [setProducts]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  const filteredProducts = useMemo(() => {
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.sku?.toLowerCase() || '').includes(searchTerm.toLowerCase())
    );
  }, [products, searchTerm]);

  const calculateTotal = useCallback(() => {
    return cart.reduce((sum, item) => sum + getPrice(item.product, item.quantity, item.unit) * item.quantity, 0);
  }, [cart]);

  const addToCart = (product: Product) => {
    const result = storeAddToCart(product);
    if (!result.success && result.error) {
      modal.error({
        title: result.error.title,
        content: result.error.message,
      });
    }
  };

  const updateQuantity = (productId: string, newQuantity: number) => {
    const result = storeUpdateQuantity(productId, newQuantity);
    if (!result.success && result.error) {
      modal.error({
        title: result.error.title,
        content: result.error.message,
      });
    }
  };

  const updateUnit = (productId: string, newUnit: string) => {
    const storeUpdateUnit = useTransactionStore.getState().updateUnit;
    const result = storeUpdateUnit(productId, newUnit);
    if (!result.success && result.error) {
      modal.error({
        title: result.error.title,
        content: result.error.message,
      });
    }
  };

  const handleCheckout = async () => {
    const total = calculateTotal();
    const payment = paymentMethod === 'NON_TUNAI' ? total : parseFloat(paymentAmount);

    if (isNaN(payment) || payment < total) {
      modal.error({
        title: 'Pembayaran Tidak Valid',
        content: 'Jumlah pembayaran tidak valid atau kurang!',
      });
      return;
    }

    const transactionNumber = `TRX-${Date.now()}`;
    const change = paymentMethod === 'NON_TUNAI' ? 0 : payment - total;
    const now = new Date().toISOString();
    const transactionId = crypto.randomUUID();
    let receiptTransaction: (Transaction & { items: TransactionItem[] }) | null = null;

    try {
      await db.transaction('rw', [db.transactions, db.transactionItems, db.products, db.profitLogs, db.profitBalance, db.financeTransactions, db.financeBalance], async () => {
        const newTransaction: Transaction = {
          id: transactionId,
          transaction_number: transactionNumber,
          total_amount: total,
          payment_amount: payment,
          change_amount: change,
          payment_method: paymentMethod,
          receipt_status: 'pending',
          created_at: now,
        };

        await db.transactions.add(newTransaction);

        const transactionItems: TransactionItem[] = cart.map((item) => {
          const sellingPrice = getPrice(item.product, item.quantity, item.unit);
          // Normalisasi harga beli ke unit yang digunakan saat transaksi
          const normalizedPurchasePrice = normalisasiHargaProduk(item.product.purchase_price, item.product, item.product.purchase_unit, item.unit);
          const unitSnapshot = createSalesUnitSnapshot(item.unit, item.product);
          
          return {
            id: crypto.randomUUID(),
            transaction_id: transactionId,
            product_id: item.product.id,
            product_name: item.product.name,
            price: sellingPrice,
            selling_price: sellingPrice,
            purchase_price: normalizedPurchasePrice,
            unit: item.unit,
            ...unitSnapshot,
            quantity: item.quantity,
            subtotal: sellingPrice * item.quantity,
            profit: (sellingPrice - normalizedPurchasePrice) * item.quantity,
            created_at: now,
          };
        });

        await db.transactionItems.bulkAdd(transactionItems);

        // Update Profit System
        const totalProfit = transactionItems.reduce((sum, item) => sum + item.profit, 0);
        const currentBalance = await db.profitBalance.get('current');
        const newBalance = (currentBalance?.amount || 0) + totalProfit;

        await db.profitBalance.put({
          id: 'current',
          amount: newBalance,
          updated_at: now,
        });

        await db.profitLogs.add({
          id: crypto.randomUUID(),
          transaction_id: transactionId,
          amount: totalProfit,
          type: 'IN',
          category: 'SALES',
          description: `Keuntungan dari transaksi ${transactionNumber}`,
          created_at: now,
          balance_after: newBalance,
        });

        // Update Finance System (Finance Bridge)
        const currentFinanceBalance = await db.financeBalance.get('current');
        const newFinanceBalance = (currentFinanceBalance?.amount || 0) + total;

        await db.financeBalance.put({
          id: 'current',
          amount: newFinanceBalance,
          updated_at: now,
        });

        await db.financeTransactions.add({
          id: crypto.randomUUID(),
          type: 'INCOME',
          category: 'PENJUALAN',
          amount: total,
          description: `Penjualan dari transaksi ${transactionNumber}`,
          created_at: now,
          reference_id: transactionId,
        });

        for (const item of cart) {
          const product = await db.products.get(item.product.id);
          if (product) {
            // Konversi quantity dari unit jual ke unit stok (base unit)
            const quantityInStokUnit = konversiSatuanProduk(item.quantity, product, item.unit, product.purchase_unit);
            await db.products.update(item.product.id, {
              stock: product.stock - quantityInStokUnit,
            });
          }
        }

        receiptTransaction = {
          ...newTransaction,
          items: transactionItems,
        };
      });

      modal.success({
        title: 'Transaksi Berhasil',
        content: (
          <div className="text-left space-y-2 mt-4" >
            <p className="text-gray-700">
              <span className="font-semibold"> Nomor Transaksi: </span> {transactionNumber}
            </p>
            <p className="text-gray-700">
              <span className="font-semibold"> Metode: </span> {paymentMethod}
            </p>
            < p className="text-gray-700" >
              <span className="font-semibold"> Total:</span> Rp {formatCurrency(total)}
            </p>
            < p className="text-gray-700" >
              <span className="font-semibold" > Dibayar: </span> Rp {formatCurrency(payment)}
            </p>
            < p className="text-green-600 font-semibold" >
              <span>Kembalian: </span> Rp {formatCurrency(change)}
            </p>
          </div>
        ),
      });

      queryClient.invalidateQueries({ queryKey: ['transactions-history'] });
      reset();
      loadProducts();

      if (receiptTransaction) {
        void printReceiptAfterTransaction(receiptTransaction)
          .then((result) => {
            queryClient.invalidateQueries({ queryKey: ['transactions-history'] });

            if (result.success) {
              message.success('Struk berhasil dicetak');
              return;
            }

            message.warning(result.error || 'Transaksi sukses, tetapi struk gagal dicetak');
          })
          .catch((error) => {
            console.error('Receipt print process failed:', error);
            message.warning('Transaksi sukses, tetapi proses print struk gagal');
          });
      }
      
      // Trigger feedback check
      window.dispatchEvent(new Event('check-feedback'));
    } catch (error) {
      console.error('Checkout failed:', error);
      modal.error({
        title: 'Gagal Membuat Transaksi',
        content: 'Terjadi kesalahan saat membuat transaksi. Silakan coba lagi.',
      });
    }
  };

  return {
    products,
    cart,
    searchTerm,
    paymentAmount,
    paymentMethod,
    showPayment,
    filteredProducts,
    addToCart,
    updateQuantity,
    updateUnit,
    removeFromCart,
    calculateTotal,
    handleCheckout,
    clearCart: reset,
    setSearchTerm,
    setPaymentAmount,
    setPaymentMethod,
    setShowPayment,
  };
};
