import { create } from 'zustand';
import { Product, CartItem, PaymentMethod } from '@/types';
import { konversiSatuan } from '@/utils/pricing';

interface TransactionState {
  products: Product[];
  cart: CartItem[];
  searchTerm: string;
  paymentAmount: string;
  paymentMethod: PaymentMethod;
  showPayment: boolean;

  // Actions
  setProducts: (products: Product[]) => void;
  setCart: (cart: CartItem[] | ((prev: CartItem[]) => CartItem[])) => void;
  setSearchTerm: (term: string) => void;
  setPaymentAmount: (amount: string) => void;
  setPaymentMethod: (method: PaymentMethod) => void;
  setShowPayment: (show: boolean) => void;

  // Logical State Actions (Non-DB)
  addToCart: (product: Product) => { success: boolean; error?: { title: string; message: string } };
  updateQuantity: (productId: string, newQuantity: number) => { success: boolean; error?: { title: string; message: string } };
  removeFromCart: (productId: string) => void;
  reset: () => void;
}

export const useTransactionStore = create<TransactionState>((set, get) => ({
  products: [],
  cart: [],
  searchTerm: '',
  paymentAmount: '',
  paymentMethod: 'TUNAI',
  showPayment: false,

  setProducts: (products) => set({ products }),
  setCart: (cart) => set((state) => ({
    cart: typeof cart === 'function' ? cart(state.cart) : cart
  })),
  setSearchTerm: (searchTerm) => set({ searchTerm }),
  setPaymentAmount: (paymentAmount) => set({ paymentAmount }),
  setPaymentMethod: (paymentMethod) => set({ paymentMethod }),
  setShowPayment: (showPayment) => set({ showPayment }),

  addToCart: (product) => {
    const { cart } = get();
    // Untuk produk curah (gram/ons), stok mungkin kecil tapi bisa dijual. 
    // Kita cek stok dalam base unit.
    if (product.stock <= 0) {
      return { 
        success: false, 
        error: { 
          title: 'Stok Tidak Tersedia', 
          message: 'Stok produk ini tidak tersedia saat ini.' 
        } 
      };
    }

    const existingItem = cart.find((item) => item.product.id === product.id);

    if (existingItem) {
      // Untuk produk dengan satuan, tambah 1 unit default.
      // Nanti di UI bisa diubah jumlahnya (misal gram).
      const increment = 1; 
      if (existingItem.quantity + increment > product.stock) {
        return { 
          success: false, 
          error: { 
            title: 'Stok Tidak Mencukupi', 
            message: `Stok hanya tersedia ${product.stock} unit.` 
          } 
        };
      }
      set({
        cart: cart.map((item) =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + increment }
            : item
        )
      });
    } else {
      set({ 
        cart: [...cart, { 
          product, 
          quantity: 1, 
          unit: product.selling_unit || 'pcs' 
        }] 
      });
    }
    return { success: true };
  },

  updateQuantity: (productId, newQuantity) => {
    const { cart } = get();
    const item = cart.find((i) => i.product.id === productId);
    if (!item) return { success: false };

    // Konversi quantity dari unit jual ke unit stok (base unit)
    const quantityInStokUnit = konversiSatuan(newQuantity, item.unit, item.product.purchase_unit);

    if (quantityInStokUnit > item.product.stock) {
      return { 
        success: false, 
        error: {
          title: 'Stok Tidak Mencukupi', 
          message: `Stok hanya tersedia ${item.product.stock} ${item.product.purchase_unit}.` 
        } 
      };
    }

    if (newQuantity < 1) {
      get().removeFromCart(productId);
      return { success: true };
    }

    set({
      cart: cart.map((item) =>
        item.product.id === productId ? { ...item, quantity: newQuantity } : item
      )
    });
    return { success: true };
  },

  removeFromCart: (productId) => {
    set((state) => ({
      cart: state.cart.filter((item) => item.product.id !== productId)
    }));
  },

  reset: () => {
    set({
      cart: [],
      paymentAmount: '',
      paymentMethod: 'TUNAI',
      showPayment: false,
    });
  }
}));
