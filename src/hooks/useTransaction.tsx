import { useEffect, useMemo, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { App } from 'antd';
import { db } from '@/lib/db';
import { useTransactionStore, type TransactionError } from '@/store/transactionStore';
import { Product } from '@/types';
import { formatCurrency } from '@/utils/formatters';
import { getPrice } from '@/utils/pricing';
import { printReceiptAfterTransaction } from '@/utils/printer/receiptService';
import { checkout } from '@/services/checkoutService';
import { useI18n } from '@/hooks/useI18n';

export const useTransaction = () => {
  const queryClient = useQueryClient();
  const { modal, message } = App.useApp();
  const { t } = useI18n();
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

  const getTransactionErrorContent = (error: TransactionError) => {
    if (error.code === 'OUT_OF_STOCK') {
      return {
        title: t('transactionError.outOfStockTitle'),
        content: t('transactionError.outOfStockMessage'),
      };
    }

    if (error.code === 'INSUFFICIENT_STOCK') {
      return {
        title: t('transactionError.insufficientStockTitle'),
        content: t('transactionError.insufficientStockMessage', {
          stock: error.stock,
          unit: error.unit,
        }),
      };
    }

    return {
      title: t('transactionError.invalidUnitTitle'),
      content: t('transactionError.invalidUnitMessage', { unit: error.unit }),
    };
  };

  const showTransactionError = (error: TransactionError) => {
    modal.error(getTransactionErrorContent(error));
  };

  const addToCart = (product: Product) => {
    const result = storeAddToCart(product);
    if (!result.success && result.error) {
      showTransactionError(result.error);
    }
  };

  const updateQuantity = (productId: string, newQuantity: number) => {
    const result = storeUpdateQuantity(productId, newQuantity);
    if (!result.success && result.error) {
      showTransactionError(result.error);
    }
  };

  const updateUnit = (productId: string, newUnit: string) => {
    const storeUpdateUnit = useTransactionStore.getState().updateUnit;
    const result = storeUpdateUnit(productId, newUnit);
    if (!result.success && result.error) {
      showTransactionError(result.error);
    }
  };

  const handleCheckout = async () => {
    const total = calculateTotal();
    const payment = paymentMethod === 'NON_TUNAI' ? total : parseFloat(paymentAmount);

    if (isNaN(payment) || payment < total) {
      modal.error({
        title: t('payment.invalidTitle'),
        content: t('payment.invalidContent'),
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
        title: t('checkout.successTitle'),
        content: (
          <div className="text-left space-y-2 mt-4" >
            <p className="text-gray-700">
              <span className="font-semibold"> {t('checkout.transactionNumber')}: </span> {transaction.transaction_number}
            </p>
            <p className="text-gray-700">
              <span className="font-semibold"> {t('checkout.method')}: </span> {paymentMethod === 'TUNAI' ? t('payment.cash') : t('payment.nonCash')}
            </p>
            < p className="text-gray-700" >
              <span className="font-semibold"> {t('cart.total')}:</span> Rp {formatCurrency(total)}
            </p>
            < p className="text-gray-700" >
              <span className="font-semibold" > {t('checkout.paid')}: </span> Rp {formatCurrency(payment)}
            </p>
            < p className="text-green-600 font-semibold" >
              <span>{t('payment.change')}: </span> Rp {formatCurrency(transaction.change_amount)}
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
            message.success(t('checkout.receiptPrinted'));
            return;
          }

          message.warning(result.error || t('checkout.receiptPrintFailed'));
        })
        .catch((error) => {
          console.error('Receipt print process failed:', error);
          message.warning(t('checkout.receiptPrintProcessFailed'));
        });
      
      // Trigger feedback check
      window.dispatchEvent(new Event('check-feedback'));
    } catch (error) {
      console.error('Checkout failed:', error);
      modal.error({
        title: t('checkout.failedTitle'),
        content: t('checkout.failedContent'),
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
