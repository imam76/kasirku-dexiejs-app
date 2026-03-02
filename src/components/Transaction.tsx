import { useState } from 'react';
import { ShoppingCart, Plus, Minus, Trash2, DollarSign, X } from 'lucide-react';
import { useTransaction } from '@/hooks/useTransaction';
import { formatCurrency } from '@/utils/formatters';

export default function Transaction() {
  const {
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
    clearCart,
    setSearchTerm,
    setPaymentAmount,
    setShowPayment,
  } = useTransaction();

  // Mobile cart drawer state (new UI only, no logic change)
  const [cartOpen, setCartOpen] = useState(false);
  const totalItems = cart.reduce((sum, i) => sum + i.quantity, 0);

  return (
    <div className="p-4 sm:p-6">
      <h2 className="text-2xl font-bold text-gray-800 mb-6">Transaksi</h2>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <div className="bg-white rounded-lg shadow-md p-4 mb-4 border border-gray-200">
            <div className="relative">
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
          </div>

          {/* Responsive: 2 cols on mobile, 3 on tablet+ */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4 pb-24 lg:pb-0">
            {filteredProducts.map((product) => (
              <div
                key={product.id}
                onClick={() => addToCart(product)}
                className="bg-white p-3 sm:p-4 rounded-lg shadow-md cursor-pointer hover:shadow-lg transition-shadow border border-gray-200"
              >
                <div className="flex items-center justify-center h-16 sm:h-24 bg-gradient-to-br from-blue-100 to-blue-200 rounded-lg mb-3">
                  <ShoppingCart size={32} className="text-blue-600 sm:w-10 sm:h-10" />
                </div>
                <h3 className="font-semibold text-gray-800 mb-1 text-sm sm:text-base line-clamp-2">{product.name}</h3>
                <p className="text-xs sm:text-sm text-gray-600 mb-2">{product.sku}</p>
                <p className="text-sm sm:text-lg font-bold text-blue-600">
                  Rp {formatCurrency(product.selling_price)}
                </p>
                <p className="text-xs sm:text-sm text-gray-500 mt-1">
                  Stok: {product.stock}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Desktop Cart Sidebar — hidden on mobile/tablet */}
        <div className="hidden lg:block lg:col-span-1">
          <div className="bg-white rounded-lg shadow-md p-4 border border-gray-200 sticky top-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-800">Keranjang</h3>
              {cart.length > 0 && (
                <button
                  onClick={clearCart}
                  className="text-red-500 hover:text-red-700 text-sm font-medium transition-colors flex items-center gap-1"
                >
                  <Trash2 size={14} />
                  Bersihkan
                </button>
              )}
            </div>

            <div className="space-y-3 mb-4 max-h-96 overflow-y-auto">
              {cart.map((item) => (
                <div
                  key={item.product.id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                >
                  <div className="flex-1">
                    <p className="font-medium text-gray-800">{item.product.name}</p>
                    <p className="text-sm text-gray-600">
                      Rp {formatCurrency(item.product.selling_price)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => updateQuantity(item.product.id, item.quantity - 1)}
                      className="p-1 bg-gray-300 hover:bg-gray-400 rounded transition-colors"
                    >
                      <Minus size={16} />
                    </button>
                    <span className="w-8 text-center font-semibold">{item.quantity}</span>
                    <button
                      onClick={() => updateQuantity(item.product.id, item.quantity + 1)}
                      className="p-1 bg-gray-300 hover:bg-gray-400 rounded transition-colors"
                    >
                      <Plus size={16} />
                    </button>
                    <button
                      onClick={() => removeFromCart(item.product.id)}
                      className="p-1 text-red-600 hover:bg-red-100 rounded transition-colors ml-2"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
              {cart.length === 0 && (
                <p className="text-center text-gray-500 py-8">Keranjang kosong</p>
              )}
            </div>

            {cart.length > 0 && (
              <>
                <div className="border-t pt-4 mb-4">
                  <div className="flex justify-between text-xl font-bold text-gray-800">
                    <span>Total:</span>
                    <span>Rp {formatCurrency(calculateTotal())}</span>
                  </div>
                </div>

                {!showPayment ? (
                  <button
                    onClick={() => setShowPayment(true)}
                    className="w-full bg-green-600 hover:bg-green-700 text-white py-3 rounded-lg font-semibold transition-colors flex items-center justify-center gap-2"
                  >
                    <DollarSign size={20} />
                    Bayar
                  </button>
                ) : (
                  <div className="space-y-3">
                    <input
                      type="number"
                      placeholder="Jumlah pembayaran"
                      value={paymentAmount}
                      onChange={(e) => setPaymentAmount(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    />
                    {paymentAmount && parseFloat(paymentAmount) >= calculateTotal() && (
                      <p className="text-sm text-gray-700">
                        Kembalian: <span className="font-bold">Rp {formatCurrency(parseFloat(paymentAmount) - calculateTotal())}</span>
                      </p>
                    )}
                    <div className="flex gap-2">
                      <button
                        onClick={handleCheckout}
                        className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg font-semibold transition-colors"
                      >
                        Konfirmasi
                      </button>
                      <button
                        onClick={() => {
                          setShowPayment(false);
                          setPaymentAmount('');
                        }}
                        className="flex-1 bg-gray-500 hover:bg-gray-600 text-white py-2 rounded-lg font-semibold transition-colors"
                      >
                        Batal
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
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
            <span className="font-bold">Rp {formatCurrency(calculateTotal())}</span>
          </button>
        </div>
      )}

      {/* Mobile/Tablet: Cart Bottom Drawer */}
      {cartOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black bg-opacity-40"
            onClick={() => setCartOpen(false)}
          />
          <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl shadow-2xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-semibold text-gray-800">Keranjang</h3>
                {cart.length > 0 && (
                  <button
                    onClick={clearCart}
                    className="text-red-500 hover:text-red-700 text-xs font-medium transition-colors flex items-center gap-1 bg-red-50 px-2 py-1 rounded"
                  >
                    <Trash2 size={12} />
                    Bersihkan
                  </button>
                )}
              </div>
              <button
                onClick={() => setCartOpen(false)}
                className="p-1.5 rounded-full hover:bg-gray-100 text-gray-500"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-3 space-y-3">
              {cart.map((item) => (
                <div
                  key={item.product.id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                >
                  <div className="flex-1">
                    <p className="font-medium text-gray-800">{item.product.name}</p>
                    <p className="text-sm text-gray-600">
                      Rp {formatCurrency(item.product.selling_price)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => updateQuantity(item.product.id, item.quantity - 1)}
                      className="p-1 bg-gray-300 hover:bg-gray-400 rounded transition-colors"
                    >
                      <Minus size={16} />
                    </button>
                    <span className="w-8 text-center font-semibold">{item.quantity}</span>
                    <button
                      onClick={() => updateQuantity(item.product.id, item.quantity + 1)}
                      className="p-1 bg-gray-300 hover:bg-gray-400 rounded transition-colors"
                    >
                      <Plus size={16} />
                    </button>
                    <button
                      onClick={() => removeFromCart(item.product.id)}
                      className="p-1 text-red-600 hover:bg-red-100 rounded transition-colors ml-2"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
              {cart.length === 0 && (
                <p className="text-center text-gray-500 py-8">Keranjang kosong</p>
              )}
            </div>

            {cart.length > 0 && (
              <div className="px-5 py-4 border-t border-gray-100">
                <div className="flex justify-between text-xl font-bold text-gray-800 mb-4">
                  <span>Total:</span>
                  <span>Rp {formatCurrency(calculateTotal())}</span>
                </div>

                {!showPayment ? (
                  <button
                    onClick={() => setShowPayment(true)}
                    className="w-full bg-green-600 hover:bg-green-700 text-white py-3 rounded-lg font-semibold transition-colors flex items-center justify-center gap-2"
                  >
                    <DollarSign size={20} />
                    Bayar
                  </button>
                ) : (
                  <div className="space-y-3">
                    <input
                      type="number"
                      placeholder="Jumlah pembayaran"
                      value={paymentAmount}
                      onChange={(e) => setPaymentAmount(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    />
                    {paymentAmount && parseFloat(paymentAmount) >= calculateTotal() && (
                      <p className="text-sm text-gray-700">
                        Kembalian: <span className="font-bold">Rp {formatCurrency(parseFloat(paymentAmount) - calculateTotal())}</span>
                      </p>
                    )}
                    <div className="flex gap-2">
                      <button
                        onClick={() => { handleCheckout(); setCartOpen(false); }}
                        className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg font-semibold transition-colors"
                      >
                        Konfirmasi
                      </button>
                      <button
                        onClick={() => {
                          setShowPayment(false);
                          setPaymentAmount('');
                        }}
                        className="flex-1 bg-gray-500 hover:bg-gray-600 text-white py-2 rounded-lg font-semibold transition-colors"
                      >
                        Batal
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
