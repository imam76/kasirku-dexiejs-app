import { useEffect, useMemo, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { App } from 'antd';
import { db } from '@/lib/db';
import { useTransactionStore } from '@/store/transactionStore';
import { Product } from '@/types';
import { formatCurrency } from '@/utils/formatters';
import { getPrice } from '@/utils/pricing';
import { printReceiptAfterTransaction } from '@/utils/printer/receiptService';
import { checkout } from '@/services/checkoutService';

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

    try {
      const checkoutResult = await checkout({
        cart,
        total,
        payment,
        paymentMethod,
      });
      const { transaction, items } = checkoutResult;

      modal.success({
        title: 'Transaksi Berhasil',
        content: (
          <div className="text-left space-y-2 mt-4" >
            <p className="text-gray-700">
              <span className="font-semibold"> Nomor Transaksi: </span> {transaction.transaction_number}
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
              <span>Kembalian: </span> Rp {formatCurrency(transaction.change_amount)}
            </p>
          </div>
        ),
      });

      queryClient.invalidateQueries({ queryKey: ['transactions-history'] });
      reset();
      loadProducts();

      void printReceiptAfterTransaction({ ...transaction, items })
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
