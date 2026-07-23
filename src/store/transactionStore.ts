import { create } from 'zustand';
import { Product, CartItem } from '@/types';
import { konversiSatuanProduk } from '@/utils/pricing';
import { getProductSellableUnits } from '@/utils/productUnits';

export type TransactionError =
  | { code: 'OUT_OF_STOCK' }
  | { code: 'INSUFFICIENT_STOCK'; stock: number; unit: string }
  | { code: 'INVALID_UNIT'; unit: string };

interface TransactionState {
  products: Product[];
  productPage: number;
  cart: CartItem[];
  searchTerm: string;
  paymentDrafts: PosPaymentDraft[];
  voucherCode: string;
  memberContactId?: string;
  redeemPoints: string;
  showPayment: boolean;
  activeDraftScope?: string;

  // Actions
  setProducts: (products: Product[]) => void;
  setProductPage: (page: number) => void;
  setCart: (cart: CartItem[] | ((prev: CartItem[]) => CartItem[])) => void;
  setSearchTerm: (term: string) => void;
  setPaymentDrafts: (drafts: PosPaymentDraft[]) => void;
  addPaymentDraft: (draft: PosPaymentDraft) => void;
  updatePaymentDraft: (clientId: string, patch: Partial<PosPaymentDraft>) => void;
  removePaymentDraft: (clientId: string) => void;
  setVoucherCode: (voucherCode: string) => void;
  setMemberContactId: (memberContactId?: string) => void;
  setRedeemPoints: (points: string) => void;
  setShowPayment: (show: boolean) => void;
  switchDraftScope: (scope?: string) => void;
  discardDraftScope: (scope: string) => void;

  // Logical State Actions (Non-DB)
  addToCart: (product: Product) => { success: boolean; error?: TransactionError };
  updateQuantity: (productId: string, newQuantity: number) => { success: boolean; error?: TransactionError };
  updateUnit: (productId: string, newUnit: string) => { success: boolean; error?: TransactionError };
  removeFromCart: (productId: string) => void;
  reset: () => void;
}

export interface PosPaymentDraft {
  clientId: string;
  paymentMethodId?: string;
  amount: string;
  reference: string;
  isAmountAutoFilled: boolean;
}

interface PosProcessDraftSnapshot {
  productPage: number;
  cart: CartItem[];
  searchTerm: string;
  paymentDrafts: PosPaymentDraft[];
  voucherCode: string;
  memberContactId?: string;
  redeemPoints: string;
  showPayment: boolean;
}

const POS_PROCESS_DRAFT_STORAGE_PREFIX = 'frayukti-pos-process-draft';

export const getPosProcessDraftScope = (userId: string, cashierSessionId: string) => (
  `${userId}:${cashierSessionId}`
);

const getDraftStorageKey = (scope: string) => `${POS_PROCESS_DRAFT_STORAGE_PREFIX}:${scope}`;

const emptyProcessDraft = (): PosProcessDraftSnapshot => ({
  productPage: 1,
  cart: [],
  searchTerm: '',
  paymentDrafts: [],
  voucherCode: '',
  memberContactId: undefined,
  redeemPoints: '',
  showPayment: false,
});

const toProcessDraftSnapshot = (state: TransactionState): PosProcessDraftSnapshot => ({
  productPage: state.productPage,
  cart: state.cart,
  searchTerm: state.searchTerm,
  paymentDrafts: state.paymentDrafts,
  voucherCode: state.voucherCode,
  memberContactId: state.memberContactId,
  redeemPoints: state.redeemPoints,
  showPayment: state.showPayment,
});

const readProcessDraft = (scope: string): PosProcessDraftSnapshot => {
  if (typeof sessionStorage === 'undefined') return emptyProcessDraft();

  try {
    const rawDraft = sessionStorage.getItem(getDraftStorageKey(scope));
    if (!rawDraft) return emptyProcessDraft();
    const draft = JSON.parse(rawDraft) as Partial<PosProcessDraftSnapshot>;
    return {
      productPage: Number.isInteger(draft.productPage) && Number(draft.productPage) > 0
        ? Number(draft.productPage)
        : 1,
      cart: Array.isArray(draft.cart) ? draft.cart : [],
      searchTerm: typeof draft.searchTerm === 'string' ? draft.searchTerm : '',
      paymentDrafts: Array.isArray(draft.paymentDrafts) ? draft.paymentDrafts : [],
      voucherCode: typeof draft.voucherCode === 'string' ? draft.voucherCode : '',
      memberContactId: typeof draft.memberContactId === 'string' ? draft.memberContactId : undefined,
      redeemPoints: typeof draft.redeemPoints === 'string' ? draft.redeemPoints : '',
      showPayment: draft.showPayment === true,
    };
  } catch (error) {
    console.warn('Draft proses POS tidak dapat dimuat.', error);
    return emptyProcessDraft();
  }
};

const writeProcessDraft = (scope: string, state: TransactionState) => {
  if (typeof sessionStorage === 'undefined') return;

  try {
    sessionStorage.setItem(getDraftStorageKey(scope), JSON.stringify(toProcessDraftSnapshot(state)));
  } catch (error) {
    console.warn('Draft proses POS tidak dapat disimpan.', error);
  }
};

const removeProcessDraft = (scope: string) => {
  if (typeof sessionStorage === 'undefined') return;
  sessionStorage.removeItem(getDraftStorageKey(scope));
};

export const useTransactionStore = create<TransactionState>((set, get) => ({
  products: [],
  productPage: 1,
  cart: [],
  searchTerm: '',
  paymentDrafts: [],
  voucherCode: '',
  memberContactId: undefined,
  redeemPoints: '',
  showPayment: false,
  activeDraftScope: undefined,

  setProducts: (products) => set({ products }),
  setProductPage: (productPage) => set({ productPage }),
  setCart: (cart) => set((state) => ({
    cart: typeof cart === 'function' ? cart(state.cart) : cart
  })),
  setSearchTerm: (searchTerm) => set({ searchTerm }),
  setPaymentDrafts: (paymentDrafts) => set({ paymentDrafts }),
  addPaymentDraft: (draft) => set((state) => ({ paymentDrafts: [...state.paymentDrafts, draft] })),
  updatePaymentDraft: (clientId, patch) => set((state) => ({
    paymentDrafts: state.paymentDrafts.map((draft) => draft.clientId === clientId ? { ...draft, ...patch } : draft),
  })),
  removePaymentDraft: (clientId) => set((state) => ({
    paymentDrafts: state.paymentDrafts.filter((draft) => draft.clientId !== clientId),
  })),
  setVoucherCode: (voucherCode) => set({ voucherCode }),
  setMemberContactId: (memberContactId) => set({ memberContactId, redeemPoints: memberContactId ? get().redeemPoints : '' }),
  setRedeemPoints: (redeemPoints) => set({ redeemPoints }),
  setShowPayment: (showPayment) => set({ showPayment }),
  switchDraftScope: (scope) => {
    if (get().activeDraftScope === scope) return;
    set({
      ...emptyProcessDraft(),
      ...(scope ? readProcessDraft(scope) : {}),
      activeDraftScope: scope,
    });
  },
  discardDraftScope: (scope) => {
    removeProcessDraft(scope);
    if (get().activeDraftScope === scope) {
      set({ ...emptyProcessDraft(), activeDraftScope: undefined });
    }
  },

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
      cart: cart.map((item) =>
        item.product.id === productId ? { ...item, quantity: newQuantity } : item
      )
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

  removeFromCart: (productId) => {
    set((state) => ({
      cart: state.cart.filter((item) => item.product.id !== productId)
    }));
  },

  reset: () => {
    set({
      ...emptyProcessDraft(),
    });
  }
}));

useTransactionStore.subscribe((state, previousState) => {
  if (!state.activeDraftScope) return;

  const processChanged = state.activeDraftScope !== previousState.activeDraftScope
    || state.productPage !== previousState.productPage
    || state.cart !== previousState.cart
    || state.searchTerm !== previousState.searchTerm
    || state.paymentDrafts !== previousState.paymentDrafts
    || state.voucherCode !== previousState.voucherCode
    || state.memberContactId !== previousState.memberContactId
    || state.redeemPoints !== previousState.redeemPoints
    || state.showPayment !== previousState.showPayment;

  if (processChanged) {
    writeProcessDraft(state.activeDraftScope, state);
  }
});
