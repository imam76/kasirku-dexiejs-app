import { CloseCircleOutlined, SearchOutlined } from '@ant-design/icons';
import { App, Button, Input } from 'antd';
import type { InputRef } from 'antd';
import { useState, useCallback, useEffect, useRef } from 'react';
import { Keyboard, ScanLine } from 'lucide-react';
import { useTransaction } from '@/hooks/useTransaction';
import { formatCurrency } from '@/utils/formatters';
import ProductList from '../components/ProductList';
import CartSidebar from '../components/CartSidebar';
import MobileCartDrawer from '../components/MobileCartDrawer';
import ScannerModal from '../components/ScannerModal';
import { useI18n } from '@/hooks/useI18n';

export default function Transaction() {
  const { message } = App.useApp();
  const { t } = useI18n();
  const {
    cart,
    searchTerm,
    paymentAmount,
    paymentMethod,
    voucherCode,
    showPayment,
    filteredProducts,
    productPagination,
    promoPreview,
    addToCart,
    updateQuantity,
    updateUnit,
    findProductByScannedCode,
    removeFromCart,
    calculateTotal,
    handleCheckout,
    clearCart,
    setSearchTerm,
    setPaymentAmount,
    setPaymentMethod,
    setVoucherCode,
    setShowPayment,
  } = useTransaction();

  // Mobile cart drawer state
  const [cartOpen, setCartOpen] = useState(false);
  const totalItems = cart.reduce((sum, i) => sum + i.quantity, 0);
  const total = calculateTotal();
  const searchInputRef = useRef<InputRef>(null);

  // Scanner state
  const [scannerOpen, setScannerOpen] = useState(false);
  const desktopShortcuts = [
    { keys: ['/'], label: t('transaction.shortcut.focusSearch') },
    { keys: ['Esc'], label: t('transaction.shortcut.clearSearch') },
  ];

  const clearSearch = useCallback(() => {
    setSearchTerm('');
    searchInputRef.current?.focus();
  }, [setSearchTerm]);

  const focusSearch = useCallback(() => {
    searchInputRef.current?.focus();
    searchInputRef.current?.select();
  }, []);

  useEffect(() => {
    const isTypingTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false;

      const tagName = target.tagName.toLowerCase();
      return target.isContentEditable || tagName === 'input' || tagName === 'textarea' || tagName === 'select';
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;

      if (event.key === '/' && !isTypingTarget(event.target)) {
        event.preventDefault();
        focusSearch();
        return;
      }

      if (event.key === 'Escape' && searchTerm) {
        event.preventDefault();
        clearSearch();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [clearSearch, focusSearch, searchTerm]);

  const handleScan = useCallback(async (text: string) => {
    const match = await findProductByScannedCode(text);

    if (match) {
      addToCart(match);
      message.success(t('transaction.addedToCart', { name: match.name }));
    } else {
      message.error(t('transaction.productNotFound', { code: text }));
    }
  }, [addToCart, findProductByScannedCode, message, t]);

  return (
    <div className="p-4 sm:p-6">
      <h2 className="text-2xl font-bold text-gray-800 mb-6">{t('transaction.title')}</h2>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(360px,1fr)_minmax(280px,300px)_minmax(280px,300px)] xl:grid-cols-[minmax(0,1fr)_minmax(300px,320px)_minmax(300px,320px)] 2xl:grid-cols-[minmax(0,1fr)_340px_340px]">
        <div id="product-list" className="min-w-0">
          <div className="bg-white rounded-lg shadow-md p-4 mb-4 border border-gray-200">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_auto]">
              <Input
                ref={searchInputRef}
                size="large"
                data-tour="transaction-search"
                allowClear={false}
                prefix={<SearchOutlined className="text-gray-400" />}
                placeholder={t('transaction.searchPlaceholder')}
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                className="rounded-lg"
              />
              <Button
                size="large"
                htmlType='button'
                icon={<CloseCircleOutlined />}
                onClick={clearSearch}
                disabled={!searchTerm}
                className="w-full sm:w-auto"
              >
                {t('transaction.reset')}
              </Button>
              <Button
                htmlType="button"
                size="large"
                icon={<ScanLine size={18} />}
                onClick={() => setScannerOpen(true)}
                data-tour="transaction-scan"
                className="flex w-full items-center justify-center gap-2 bg-indigo-600 font-semibold text-white hover:!border-indigo-700 hover:!bg-indigo-700 hover:!text-white sm:w-auto"
              >
                {t('transaction.scanBarcode')}
              </Button>
            </div>

            <div className="mt-3 hidden flex-wrap items-center gap-2 rounded-lg border border-blue-100 bg-blue-50/70 px-3 py-2 text-xs text-blue-900 lg:flex">
              <div className="flex items-center gap-1.5 font-semibold">
                <Keyboard size={15} />
                <span>{t('transaction.desktopShortcutTitle')}</span>
              </div>
              {desktopShortcuts.map((shortcut) => (
                <div
                  key={shortcut.label}
                  className="flex items-center gap-1.5 rounded-md bg-white px-2 py-1 shadow-sm ring-1 ring-blue-100"
                >
                  <span className="flex items-center gap-1">
                    {shortcut.keys.map((key) => (
                      <kbd
                        key={key}
                        className="min-w-6 rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-center font-mono text-[11px] font-semibold leading-none text-blue-800"
                      >
                        {key}
                      </kbd>
                    ))}
                  </span>
                  <span className="font-medium">{shortcut.label}</span>
                </div>
              ))}
            </div>
          </div>

          <ProductList
            products={filteredProducts}
            cart={cart}
            addToCart={addToCart}
            pagination={productPagination}
          />
        </div>

        <CartSidebar
          cart={cart}
          updateQuantity={updateQuantity}
          updateUnit={updateUnit}
          removeFromCart={removeFromCart}
          clearCart={clearCart}
          total={total}
          showPayment={showPayment}
          paymentAmount={paymentAmount}
          paymentMethod={paymentMethod}
          voucherCode={voucherCode}
          promoPreview={promoPreview}
          setShowPayment={setShowPayment}
          setPaymentAmount={setPaymentAmount}
          setPaymentMethod={setPaymentMethod}
          setVoucherCode={setVoucherCode}
          handleCheckout={handleCheckout}
        />
      </div>

      {/* Mobile/Tablet: Floating Cart Button */}
      {totalItems > 0 && (
        <div className="fixed bottom-4 left-4 right-4 lg:hidden z-30">
          <button
            onClick={() => setCartOpen(true)}
            data-tour="transaction-mobile-cart"
            className="w-full bg-green-600 hover:bg-green-700 text-white py-3.5 px-5 rounded-xl shadow-xl font-semibold flex items-center justify-between transition-colors"
          >
            <div className="flex items-center gap-3">
              <span className="bg-white text-green-600 font-bold rounded-full w-7 h-7 flex items-center justify-center text-sm">
                {totalItems}
              </span>
              <span>{t('transaction.viewCart')}</span>
            </div>
            <span className="font-bold">Rp {formatCurrency(total)}</span>
          </button>
        </div>
      )}

      <MobileCartDrawer
        isOpen={cartOpen}
        onClose={() => setCartOpen(false)}
        cart={cart}
        updateQuantity={updateQuantity}
        updateUnit={updateUnit}
        removeFromCart={removeFromCart}
        clearCart={clearCart}
        total={total}
        showPayment={showPayment}
        paymentAmount={paymentAmount}
        paymentMethod={paymentMethod}
        voucherCode={voucherCode}
        promoPreview={promoPreview}
        setShowPayment={setShowPayment}
        setPaymentAmount={setPaymentAmount}
        setPaymentMethod={setPaymentMethod}
        setVoucherCode={setVoucherCode}
        handleCheckout={handleCheckout}
      />

      {scannerOpen && (
        <ScannerModal
          onClose={() => setScannerOpen(false)}
          onScan={handleScan}
        />
      )}
    </div>
  );
}
