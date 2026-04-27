import { App } from 'antd';
import { useState, useCallback } from 'react';
import { ScanLine, X } from 'lucide-react';
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

  // Scanner state
  const [scannerOpen, setScannerOpen] = useState(false);

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
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  placeholder="Cari produk (nama atau SKU)..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent pr-10"
                />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                    aria-label="Hapus pencarian"
                  >
                    <X size={18} />
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => setScannerOpen(true)}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-2 rounded-lg font-semibold transition-colors flex items-center gap-2"
              >
                <ScanLine size={18} />
                <span className="hidden sm:inline">Scan</span>
              </button>
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
