import { useEffect, useMemo, useCallback, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLiveQuery } from 'dexie-react-hooks';
import { App } from 'antd';
import { db } from '@/lib/db';
import { useTransactionStore, type TransactionError } from '@/store/transactionStore';
import { Contact, MembershipSetting, Product } from '@/types';
import { formatCurrency } from '@/utils/formatters';
import { getCartItemPrice } from '@/utils/pricing';
import { printReceiptAfterTransaction } from '@/utils/printer/receiptService';
import { checkout } from '@/services/checkoutService';
import { useI18n } from '@/hooks/useI18n';
import { evaluatePromos, getActivePromos } from '@/services/promoService';
import {
  DEFAULT_MEMBERSHIP_SETTING,
  createRetailMemberFromPos,
  evaluateMembershipCheckoutSync,
  getMembershipSetting,
  type QuickCreateMemberInput,
} from '@/services/membershipService';

const TRANSACTION_PRODUCT_PAGE_SIZE = 9;
const EMPTY_TRANSACTION_PRODUCT_PAGE = {
  products: [] as Product[],
  total: 0,
};
const FALLBACK_MEMBERSHIP_SETTING: MembershipSetting = {
  ...DEFAULT_MEMBERSHIP_SETTING,
  created_at: '',
  updated_at: '',
};

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
    voucherCode,
    memberContactId,
    redeemPoints,
    showPayment,
    setProducts,
    setSearchTerm,
    setPaymentAmount,
    setPaymentMethod,
    setVoucherCode,
    setMemberContactId,
    setRedeemPoints,
    setShowPayment,
    addToCart: storeAddToCart,
    updateQuantity: storeUpdateQuantity,
    removeFromCart,
    reset,
  } = useTransactionStore();
  const [productPage, setProductPage] = useState(1);
  const productSearchTerm = searchTerm.trim().toLowerCase();

  useEffect(() => {
    setProductPage(1);
  }, [productSearchTerm]);

  const productPageResult = useLiveQuery(
    async () => {
      if (productSearchTerm) {
        const matchedProducts = await db.products
          .orderBy('name')
          .filter((product) => (
            product.name.toLowerCase().includes(productSearchTerm) ||
            (product.sku?.toLowerCase() || '').includes(productSearchTerm)
          ))
          .toArray();

        return {
          products: matchedProducts,
          total: matchedProducts.length,
        };
      }

      const offset = (productPage - 1) * TRANSACTION_PRODUCT_PAGE_SIZE;
      const [total, pageProducts] = await Promise.all([
        db.products.count(),
        db.products
          .orderBy('name')
          .offset(offset)
          .limit(TRANSACTION_PRODUCT_PAGE_SIZE)
          .toArray(),
      ]);

      return {
        products: pageProducts,
        total,
      };
    },
    [productPage, productSearchTerm],
    EMPTY_TRANSACTION_PRODUCT_PAGE,
  );
  const productTotal = productPageResult.total;

  useEffect(() => {
    setProducts(productPageResult.products);
  }, [productPageResult.products, setProducts]);

  useEffect(() => {
    if (productSearchTerm) return;

    const lastPage = Math.max(1, Math.ceil(productTotal / TRANSACTION_PRODUCT_PAGE_SIZE));
    if (productPage > lastPage) {
      setProductPage(lastPage);
    }
  }, [productPage, productSearchTerm, productTotal]);

  const { data: activePromos = [] } = useQuery({
    queryKey: ['activePromos'],
    queryFn: () => getActivePromos(new Date()),
  });
  const { data: membershipSetting = FALLBACK_MEMBERSHIP_SETTING } = useQuery({
    queryKey: ['membershipSetting'],
    queryFn: getMembershipSetting,
  });
  const activeMembers = useLiveQuery(
    () => db.contacts
      .orderBy('name')
      .filter((contact) => Boolean(contact.is_member && contact.is_active && (contact.membership_status ?? 'ACTIVE') === 'ACTIVE'))
      .toArray(),
    [],
    [] as Contact[],
  );
  const selectedMember = useMemo(
    () => activeMembers.find((member) => member.id === memberContactId) ?? null,
    [activeMembers, memberContactId],
  );
  const createMemberMutation = useMutation({
    mutationFn: createRetailMemberFromPos,
    onSuccess: (member) => {
      setMemberContactId(member.id);
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
    },
  });

  const filteredProducts = products;
  const productPagination = productSearchTerm
    ? undefined
    : {
        currentPage: productPage,
        pageSize: TRANSACTION_PRODUCT_PAGE_SIZE,
        total: productTotal,
        onChange: setProductPage,
      };

  const calculateSubtotal = useCallback(() => {
    return cart.reduce((sum, item) => sum + getCartItemPrice(item) * item.quantity, 0);
  }, [cart]);

  const promoPreview = useMemo(() => {
    return evaluatePromos({
      cart,
      promos: activePromos,
      voucherCode,
    });
  }, [activePromos, cart, voucherCode]);
  const membershipPreview = useMemo(() => {
    return evaluateMembershipCheckoutSync({
      cart,
      promoEvaluation: promoPreview,
      member: selectedMember,
      redeemPoints: Number(redeemPoints || 0),
      setting: membershipSetting,
    });
  }, [cart, membershipSetting, promoPreview, redeemPoints, selectedMember]);

  const calculateTotal = useCallback(() => {
    return membershipPreview.total_after_redeem;
  }, [membershipPreview.total_after_redeem]);

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

  const findProductByScannedCode = useCallback(async (scanCode: string) => {
    const normalizedScanCode = scanCode.trim().toLowerCase();
    if (!normalizedScanCode) return undefined;

    return db.products
      .filter((product) => (product.sku || '').trim().toLowerCase() === normalizedScanCode)
      .first();
  }, []);

  const handleCheckout = async () => {
    const total = membershipPreview.total_after_redeem;
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
        payment,
        paymentMethod,
        voucherCode,
        memberContactId,
        redeemPoints: Number(redeemPoints || 0),
      });
      const { transaction, items, warnings } = checkoutResult;

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
              <span className="font-semibold"> {t('cart.total')}:</span> Rp {formatCurrency(transaction.total_amount)}
            </p>
            {(transaction.discount_amount ?? 0) > 0 && (
              <p className="text-gray-700">
                <span className="font-semibold"> {t('cart.discount')}:</span> -Rp {formatCurrency(transaction.discount_amount ?? 0)}
              </p>
            )}
            {transaction.member_name && (
              <p className="text-gray-700">
                <span className="font-semibold">Member:</span> {transaction.member_number ? `${transaction.member_number} - ` : ''}{transaction.member_name}
              </p>
            )}
            {(transaction.membership_points_earned ?? 0) > 0 && (
              <p className="text-gray-700">
                <span className="font-semibold">Poin didapat:</span> {transaction.membership_points_earned}
              </p>
            )}
            {(transaction.membership_points_redeemed ?? 0) > 0 && (
              <p className="text-gray-700">
                <span className="font-semibold">Poin dipakai:</span> {transaction.membership_points_redeemed}
              </p>
            )}
            < p className="text-gray-700" >
              <span className="font-semibold" > {t('checkout.paid')}: </span> Rp {formatCurrency(transaction.payment_amount)}
            </p>
            < p className="text-green-600 font-semibold" >
              <span>{t('payment.change')}: </span> Rp {formatCurrency(transaction.change_amount)}
            </p>
          </div>
        ),
      });

      warnings?.forEach((warning) => {
        message.warning(warning);
      });

      queryClient.invalidateQueries({ queryKey: ['transactions-history'] });
      queryClient.invalidateQueries({ queryKey: ['journalEntries'] });
      queryClient.invalidateQueries({ queryKey: ['trialBalance'] });
      queryClient.invalidateQueries({ queryKey: ['incomeStatement'] });
      queryClient.invalidateQueries({ queryKey: ['balanceSheet'] });
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      queryClient.invalidateQueries({ queryKey: ['membershipSetting'] });
      reset();

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
        content: error instanceof Error ? error.message : t('checkout.failedContent'),
      });
    }
  };

  return {
    products,
    cart,
    searchTerm,
    paymentAmount,
    paymentMethod,
    voucherCode,
    memberContactId,
    redeemPoints,
    showPayment,
    filteredProducts,
    productPagination,
    promoPreview,
    membershipPreview,
    activeMembers,
    selectedMember,
    membershipSetting,
    createMember: createMemberMutation.mutateAsync as (input: QuickCreateMemberInput) => Promise<Contact>,
    isCreatingMember: createMemberMutation.isPending,
    addToCart,
    updateQuantity,
    updateUnit,
    findProductByScannedCode,
    removeFromCart,
    calculateSubtotal,
    calculateTotal,
    handleCheckout,
    clearCart: reset,
    setSearchTerm,
    setPaymentAmount,
    setPaymentMethod,
    setVoucherCode,
    setMemberContactId,
    setRedeemPoints,
    setShowPayment,
  };
};
