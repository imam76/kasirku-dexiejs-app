import { beforeEach, describe, expect, test } from 'bun:test';
import type { Product } from '@/types';
import { useTransactionStore } from '@/store/transactionStore';

const product: Product = {
  id: 'draft-product',
  name: 'Produk Draft',
  purchase_unit: 'pcs',
  selling_unit: 'pcs',
  purchase_price: 5_000,
  selling_price: 10_000,
  stock: 20,
  sku: 'DRAFT-001',
  created_at: '2026-08-21T00:00:00.000Z',
  updated_at: '2026-08-21T00:00:00.000Z',
};

describe('POS held transaction drafts', () => {
  beforeEach(() => {
    useTransactionStore.setState({
      cart: [],
      paymentDrafts: [],
      voucherCode: '',
      memberContactId: undefined,
      redeemPoints: '',
      showPayment: false,
      heldDrafts: [],
      activeDraftScope: 'cashier:session',
    });
  });

  test('holds the current cart and resumes it without re-entering items', () => {
    expect(useTransactionStore.getState().addToCart(product)).toEqual({ success: true });

    const held = useTransactionStore.getState().holdCurrentDraft('Queue XXX');

    expect(held?.label).toBe('Queue XXX');
    expect(useTransactionStore.getState().cart).toHaveLength(0);
    expect(useTransactionStore.getState().heldDrafts).toHaveLength(1);

    expect(useTransactionStore.getState().resumeHeldDraft(held!.id)).toBe(true);
    expect(useTransactionStore.getState().cart[0]).toMatchObject({
      product: { id: product.id },
      quantity: 1,
    });
    expect(useTransactionStore.getState().heldDrafts).toHaveLength(0);
  });

  test('does not overwrite an active cart when another draft is opened', () => {
    useTransactionStore.getState().addToCart(product);
    const held = useTransactionStore.getState().holdCurrentDraft('Queue XXX');
    useTransactionStore.getState().addToCart({ ...product, id: 'queue-aaa-product' });

    expect(useTransactionStore.getState().resumeHeldDraft(held!.id)).toBe(false);
    expect(useTransactionStore.getState().cart[0]?.product.id).toBe('queue-aaa-product');
    expect(useTransactionStore.getState().heldDrafts).toHaveLength(1);
  });

  test('deletes a held draft explicitly', () => {
    useTransactionStore.getState().addToCart(product);
    const held = useTransactionStore.getState().holdCurrentDraft('Queue XXX');

    useTransactionStore.getState().deleteHeldDraft(held!.id);

    expect(useTransactionStore.getState().heldDrafts).toHaveLength(0);
  });
});
