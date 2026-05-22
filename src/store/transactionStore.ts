import { create } from 'zustand';
import { Product, CartItem, PaymentMethod } from '@/types';
import { getCartItemOriginalPrice, konversiSatuanProduk } from '@/utils/pricing';
import { getProductSellableUnits } from '@/utils/productUnits';

export type TransactionError =
  | { code: 'OUT_OF_STOCK' }
  | { code: 'INSUFFICIENT_STOCK'; stock: number; unit: string }
  | { code: 'INVALID_UNIT'; unit: string };

interface TransactionState {
  products: Product[];
  cart: CartItem[];
  searchTerm: string;
  paymentAmount: string;
  paymentMethod: PaymentMethod;
  voucherCode: string;
  showPayment: boolean;

  // Actions
  setProducts: (products: Product[]) => void;
  setCart: (cart: CartItem[] | ((prev: CartItem[]) => CartItem[])) => void;
  setSearchTerm: (term: string) => void;
  setPaymentAmount: (amount: string) => void;
  setPaymentMethod: (method: PaymentMethod) => void;
  setVoucherCode: (voucherCode: string) => void;
  setShowPayment: (show: boolean) => void;

  // Logical State Actions (Non-DB)
  addToCart: (product: Product) => { success: boolean; error?: TransactionError };
  updateQuantity: (productId: string, newQuantity: number) => { success: boolean; error?: TransactionError };
  updateUnit: (productId: string, newUnit: string) => { success: boolean; error?: TransactionError };
  updateCustomPrice: (productId: string, customPrice: number | undefined, editedBy?: string) => void;
  removeFromCart: (productId: string) => void;
  reset: () => void;
}

export const useTransactionStore = create<TransactionState>((set, get) => ({
  products: [],
  cart: [],
  searchTerm: '',
  paymentAmount: '',
  paymentMethod: 'TUNAI',
  voucherCode: '',
  showPayment: false,

  setProducts: (products) => set({ products }),
  setCart: (cart) => set((state) => ({
    cart: typeof cart === 'function' ? cart(state.cart) : cart
  })),
  setSearchTerm: (searchTerm) => set({ searchTerm }),
  setPaymentAmount: (paymentAmount) => set({ paymentAmount }),
  setPaymentMethod: (paymentMethod) => set({ paymentMethod }),
  setVoucherCode: (voucherCode) => set({ voucherCode }),
  setShowPayment: (showPayment) => set({ showPayment }),

  addToCart: (product) => {
    const { cart } = get();
    // Untuk produk curah (gram/ons), stok mungkin kecil tapi bisa dijual. 
    // Kita cek stok dalam base unit.
    if (product.stock <= 0) {
      return { 
        success: false, 
        error: { code: 'OUT_OF_STOCK' } 
      };
    }

    const existingItem = cart.find((item) => item.product.id === product.id);

    if (existingItem) {
      // Untuk produk dengan satuan, tambah 1 unit default.
      // Nanti di UI bisa diubah jumlahnya (misal gram).
      const increment = 1; 
      const nextQuantityInStockUnit = konversiSatuanProduk(
        existingItem.quantity + increment,
        product,
        existingItem.unit,
        product.purchase_unit,
      );
      if (nextQuantityInStockUnit > product.stock) {
        return { 
          success: false, 
          error: { code: 'INSUFFICIENT_STOCK', stock: product.stock, unit: product.purchase_unit } 
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
    const quantityInStokUnit = konversiSatuanProduk(newQuantity, item.product, item.unit, item.product.purchase_unit);

    if (quantityInStokUnit > item.product.stock) {
      return { 
        success: false, 
        error: {
          code: 'INSUFFICIENT_STOCK',
          stock: item.product.stock,
          unit: item.product.purchase_unit,
        } 
      };
    }

    if (newQuantity < 1) {
      get().removeFromCart(productId);
      return { success: true };
    }

    set({
      cart: cart.map((item) => {
        if (item.product.id !== productId) return item;

        const nextItem = { ...item, quantity: newQuantity };
        if (nextItem.custom_price === undefined) return nextItem;

        return {
          ...nextItem,
          original_price: getCartItemOriginalPrice(nextItem),
        };
      })
    });
    return { success: true };
  },

  updateUnit: (productId, newUnit) => {
    const { cart } = get();
    const item = cart.find((i) => i.product.id === productId);
    if (!item) return { success: false };

    // Validate that the new unit is in the product's sellable units
    const sellableUnits = getProductSellableUnits(item.product);
    if (!sellableUnits.includes(newUnit)) {
      return {
        success: false,
        error: {
          code: 'INVALID_UNIT',
          unit: newUnit,
        }
      };
    }

    // Harga manual disimpan per satuan. Kalau satuan berubah, reset harga manual supaya tidak salah basis.
    set({
      cart: cart.map((cartItem) => {
        if (cartItem.product.id !== productId) return cartItem;

        return {
          product: cartItem.product,
          quantity: cartItem.quantity,
          unit: newUnit,
        };
      })
    });
    return { success: true };
  },

  updateCustomPrice: (productId, customPrice, editedBy) => {
    const { cart } = get();

    set({
      cart: cart.map((cartItem) => {
        if (cartItem.product.id !== productId) return cartItem;

        if (customPrice === undefined) {
          return {
            product: cartItem.product,
            quantity: cartItem.quantity,
            unit: cartItem.unit,
          };
        }

        return {
          ...cartItem,
          custom_price: customPrice,
          original_price: cartItem.original_price ?? getCartItemOriginalPrice(cartItem),
          price_edited_by: editedBy,
          price_edited_at: new Date().toISOString(),
        };
      })
    });
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
      voucherCode: '',
      showPayment: false,
    });
  }
}));
