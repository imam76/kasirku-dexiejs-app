import { CloseCircleOutlined, SearchOutlined } from '@ant-design/icons';
import { App, Button, Input } from 'antd';
import type { InputRef } from 'antd';
import { useState, useCallback, useEffect, useRef } from 'react';
import { ScanLine } from 'lucide-react';
import { useTransaction } from '@/hooks/useTransaction';
import { formatCurrency } from '@/utils/formatters';
import ProductList from '../components/ProductList';
import CartSidebar from '../components/CartSidebar';
import MobileCartDrawer from '../components/MobileCartDrawer';
import ScannerModal from '../components/ScannerModal';

export default function Transaction() {
  const { message } = App.useApp();
  const {
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
    clearCart,
    setSearchTerm,
    setPaymentAmount,
    setPaymentMethod,
    setShowPayment,
  } = useTransaction();

  // Mobile cart drawer state
  const [cartOpen, setCartOpen] = useState(false);
  const totalItems = cart.reduce((sum, i) => sum + i.quantity, 0);
  const total = calculateTotal();
  const searchInputRef = useRef<InputRef>(null);

  // Scanner state
  const [scannerOpen, setScannerOpen] = useState(false);

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

  const handleScan = useCallback((text: string) => {
    const match = products.find((p) => (p.sku || '').trim().toLowerCase() === text.toLowerCase());

    if (match) {
      addToCart(match);
      message.success(`Ditambahkan: ${match.name}`);
    } else {
      message.error(`Produk dengan SKU/barcode "${text}" tidak ditemukan.`);
    }
  }, [products, addToCart, message]);

  return (
    <div className="p-4 sm:p-6">
      <h2 className="text-2xl font-bold text-gray-800 mb-6">Transaksi</h2>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <div className="bg-white rounded-lg shadow-md p-4 mb-4 border border-gray-200">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_auto]">
              <Input
                ref={searchInputRef}
                size="large"
                allowClear={false}
                prefix={<SearchOutlined className="text-gray-400" />}
                placeholder="Cari produk (nama atau SKU)..."
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
                Reset
              </Button>
              <Button
                htmlType="button"
                size="large"
                icon={<ScanLine size={18} />}
                onClick={() => setScannerOpen(true)}
                className="flex w-full items-center justify-center gap-2 bg-indigo-600 font-semibold text-white hover:!border-indigo-700 hover:!bg-indigo-700 hover:!text-white sm:w-auto"
              >
                Scan Barcode
              </Button>
            </div>
          </div>

          <ProductList
            products={filteredProducts}
            cart={cart}
            addToCart={addToCart}
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
          setShowPayment={setShowPayment}
          setPaymentAmount={setPaymentAmount}
          setPaymentMethod={setPaymentMethod}
          handleCheckout={handleCheckout}
        />
      </div>

      {/* Mobile/Tablet: Floating Cart Button */}
      {totalItems > 0 && (
        <div className="fixed bottom-4 left-4 right-4 lg:hidden z-30">
          <button
            onClick={() => setCartOpen(true)}
            className="w-full bg-green-600 hover:bg-green-700 text-white py-3.5 px-5 rounded-xl shadow-xl font-semibold flex items-center justify-between transition-colors"
          >
            <div className="flex items-center gap-3">
              <span className="bg-white text-green-600 font-bold rounded-full w-7 h-7 flex items-center justify-center text-sm">
                {totalItems}
              </span>
              <span>Lihat Keranjang</span>
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
        setShowPayment={setShowPayment}
        setPaymentAmount={setPaymentAmount}
        setPaymentMethod={setPaymentMethod}
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
