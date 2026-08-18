import { create } from 'zustand';

export interface PurchaseDraftLine {
  product_id: string;
  quantity: number;
}

interface PurchaseDraftState {
  lines: PurchaseDraftLine[];
  setLines: (lines: PurchaseDraftLine[]) => void;
  clearLines: () => void;
}

/**
 * Titipan sekali pakai antara layar yang memilih produk dan editor pembelian.
 * Sengaja tanpa persist dan dikosongkan begitu editornya ditutup, supaya
 * "+ Baru" biasa tidak pernah kebagian sisa pilihan lama.
 */
export const usePurchaseDraftStore = create<PurchaseDraftState>((set) => ({
  lines: [],
  setLines: (lines) => set({ lines }),
  clearLines: () => set((state) => (state.lines.length ? { lines: [] } : state)),
}));

export const setPurchaseDraftLines = (lines: PurchaseDraftLine[]) => {
  usePurchaseDraftStore.getState().setLines(lines);
};

export const clearPurchaseDraftLines = () => {
  usePurchaseDraftStore.getState().clearLines();
};
