import { useEffect, useMemo, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { App } from 'antd';
import { db } from '@/lib/db';
import { useTransactionStore } from '@/store/transactionStore';
import { Transaction, TransactionItem, Product } from '@/types';
import { formatCurrency } from '@/utils/formatters';

export const useTransaction = () => {
  const queryClient = useQueryClient();
  const { modal } = App.useApp();
  const {
    products,
    cart,
    searchTerm,
    paymentAmount,
    showPayment,
    setProducts,
    setSearchTerm,
    setPaymentAmount,
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
        p.sku.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [products, searchTerm]);

  const calculateTotal = useCallback(() => {
    return cart.reduce((sum, item) => sum + item.product.selling_price * item.quantity, 0);
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

  const handleCheckout = async () => {
    const total = calculateTotal();
    const payment = parseFloat(paymentAmount);

    if (isNaN(payment) || payment < total) {
      modal.error({
        title: 'Pembayaran Tidak Valid',
        content: 'Jumlah pembayaran tidak valid atau kurang!',
      });
      return;
    }

    const transactionNumber = `TRX-${Date.now()}`;
    const change = payment - total;
    const now = new Date().toISOString();
    const transactionId = crypto.randomUUID();

    try {
      await db.transaction('rw', db.transactions, db.transactionItems, db.products, db.profitLogs, db.profitBalance, async () => {
        const newTransaction: Transaction = {
          id: transactionId,
          transaction_number: transactionNumber,
          total_amount: total,
          payment_amount: payment,
          change_amount: change,
          created_at: now,
        };

        await db.transactions.add(newTransaction);

        const transactionItems: TransactionItem[] = cart.map((item) => ({
          id: crypto.randomUUID(),
          transaction_id: transactionId,
          product_id: item.product.id,
          product_name: item.product.name,
          price: item.product.selling_price,
          purchase_price: item.product.purchase_price,
          quantity: item.quantity,
          subtotal: item.product.selling_price * item.quantity,
          profit: (item.product.selling_price - item.product.purchase_price) * item.quantity,
          created_at: now,
        }));

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
          description: `Keuntungan dari transaksi ${transactionNumber}`,
          created_at: now,
          balance_after: newBalance,
        });

        for (const item of cart) {
          const product = await db.products.get(item.product.id);
          if (product) {
            await db.products.update(item.product.id, {
              stock: product.stock - item.quantity,
            });
          }
        }
      });

      modal.success({
        title: 'Transaksi Berhasil',
        content: (
          <div className= "text-left space-y-2 mt-4" >
          <p className="text-gray-700">
            <span className="font-semibold"> Nomor Transaksi: </span> {transactionNumber}
              </p>
              < p className="text-gray-700" >
              <span className="font-semibold"> Total:</span> Rp {formatCurrency(total)}
        </p>
        < p className = "text-gray-700" >
        <span className="font-semibold" > Dibayar: </span> Rp {formatCurrency(payment)}
        </p>
      < p className = "text-green-600 font-semibold" >
      <span>Kembalian: </span> Rp {formatCurrency(change)}
      </p>
      </div>
      ),
      });

    queryClient.invalidateQueries({ queryKey: ['transactions-history'] });
    reset();
    loadProducts();
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
  showPayment,
  filteredProducts,
  addToCart,
  updateQuantity,
  removeFromCart,
  calculateTotal,
  handleCheckout,
  clearCart: reset,
  setSearchTerm,
  setPaymentAmount,
  setShowPayment,
};
};
