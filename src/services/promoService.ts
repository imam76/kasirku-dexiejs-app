import { getCurrentSessionUser, requireUserPermission, writeActivityLog } from '@/auth/authService';
import { db } from '@/lib/db';
import type {
  AppliedPromoSnapshot,
  CartItem,
  ProductCategory,
  Promo,
  PromoAdjustment,
  PromoAppliesTo,
  PromoType,
} from '@/types';
import { getCartItemPrice } from '@/utils/pricing';

export interface EvaluatePromoInput {
  cart: CartItem[];
  promos: Promo[];
  voucherCode?: string;
  now?: Date;
}

export interface PromoLineResult {
  product_id: string;
  price_before_discount: number;
  quantity: number;
  subtotal_before_discount: number;
  discount_amount: number;
  final_unit_price: number;
  final_subtotal: number;
  adjustments: PromoAdjustment[];
}

export interface PromoEvaluationResult {
  subtotal_before_discount: number;
  discount_amount: number;
  total_amount: number;
  lines: PromoLineResult[];
  applied_promos_snapshot: AppliedPromoSnapshot[];
  discount_breakdown: Array<{ label: string; amount: number }>;
}

export interface PromoFormInput {
  name: string;
  type: PromoType;
  value: number;
  applies_to: PromoAppliesTo;
  product_ids?: string[];
  categories?: ProductCategory[];
  start_at?: string | null;
  end_at?: string | null;
  min_qty?: number | null;
  min_total?: number | null;
  voucher_code?: string | null;
  active: boolean;
  priority: number;
}

type PromoCandidate = {
  promo: Promo;
  eligibleLineIndexes: number[];
  discountAmount: number;
};

const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

const normalizeVoucherCode = (value?: string | null) => {
  const normalized = value?.trim().toUpperCase() ?? '';
  return normalized || null;
};

const normalizeOptionalNumber = (value?: number | null) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
};

const isPromoInDateRange = (promo: Promo, now: Date) => {
  const nowTime = now.getTime();
  const startTime = promo.start_at ? new Date(promo.start_at).getTime() : null;
  const endTime = promo.end_at ? new Date(promo.end_at).getTime() : null;

  if (startTime !== null && (!Number.isFinite(startTime) || nowTime < startTime)) return false;
  if (endTime !== null && (!Number.isFinite(endTime) || nowTime > endTime)) return false;

  return true;
};

const isPromoVoucherMatched = (promo: Promo, voucherCode?: string) => {
  const promoVoucher = normalizeVoucherCode(promo.voucher_code);
  if (!promoVoucher) return true;

  return promoVoucher === normalizeVoucherCode(voucherCode);
};

const isLineEligibleForPromo = (promo: Promo, item: CartItem) => {
  if (promo.applies_to === 'all') return true;

  if (promo.applies_to === 'product') {
    return Boolean(promo.product_ids?.includes(item.product.id));
  }

  return Boolean(item.product.category && promo.categories?.includes(item.product.category));
};

const getEligibleLineIndexes = (promo: Promo, cart: CartItem[]) => {
  return cart.reduce<number[]>((indexes, item, index) => {
    if (isLineEligibleForPromo(promo, item)) {
      indexes.push(index);
    }

    return indexes;
  }, []);
};

const getPromoDiscountAmount = (
  promo: Promo,
  eligibleLineIndexes: number[],
  lines: PromoLineResult[],
) => {
  const eligibleSubtotal = roundMoney(
    eligibleLineIndexes.reduce((sum, index) => sum + lines[index].subtotal_before_discount, 0),
  );
  const eligibleQuantity = eligibleLineIndexes.reduce((sum, index) => sum + lines[index].quantity, 0);
  const minQty = normalizeOptionalNumber(promo.min_qty);
  const minTotal = normalizeOptionalNumber(promo.min_total);

  if (eligibleLineIndexes.length === 0 || eligibleSubtotal <= 0) return 0;
  if (minQty !== null && eligibleQuantity < minQty) return 0;
  if (minTotal !== null && eligibleSubtotal < minTotal) return 0;

  if (promo.type === 'percent') {
    const percentValue = Math.min(Math.max(promo.value, 0), 100);
    return roundMoney(eligibleSubtotal * (percentValue / 100));
  }

  return roundMoney(Math.min(Math.max(promo.value, 0), eligibleSubtotal));
};

const createBaseLines = (cart: CartItem[]): PromoLineResult[] => {
  return cart.map((item) => {
    const priceBeforeDiscount = getCartItemPrice(item);
    const subtotalBeforeDiscount = roundMoney(priceBeforeDiscount * item.quantity);

    return {
      product_id: item.product.id,
      price_before_discount: priceBeforeDiscount,
      quantity: item.quantity,
      subtotal_before_discount: subtotalBeforeDiscount,
      discount_amount: 0,
      final_unit_price: priceBeforeDiscount,
      final_subtotal: subtotalBeforeDiscount,
      adjustments: [],
    };
  });
};

const createPromoCandidate = (
  promo: Promo,
  cart: CartItem[],
  lines: PromoLineResult[],
): PromoCandidate | null => {
  const eligibleLineIndexes = getEligibleLineIndexes(promo, cart);
  const discountAmount = getPromoDiscountAmount(promo, eligibleLineIndexes, lines);

  if (discountAmount <= 0) return null;

  return {
    promo,
    eligibleLineIndexes,
    discountAmount,
  };
};

const pickBestCandidate = (candidates: PromoCandidate[]) => {
  return [...candidates].sort((left, right) => {
    if (right.discountAmount !== left.discountAmount) {
      return right.discountAmount - left.discountAmount;
    }

    if (left.promo.priority !== right.promo.priority) {
      return left.promo.priority - right.promo.priority;
    }

    return left.promo.id.localeCompare(right.promo.id);
  })[0];
};

const allocateDiscountToLines = (candidate: PromoCandidate, lines: PromoLineResult[]) => {
  const eligibleLines = candidate.eligibleLineIndexes.map((index) => lines[index]);
  const eligibleSubtotal = roundMoney(
    eligibleLines.reduce((sum, line) => sum + line.subtotal_before_discount, 0),
  );
  const adjustments: PromoAdjustment[] = [];
  let allocated = 0;

  candidate.eligibleLineIndexes.forEach((lineIndex, index) => {
    const line = lines[lineIndex];
    const isLast = index === candidate.eligibleLineIndexes.length - 1;
    const rawShare = eligibleSubtotal > 0
      ? candidate.discountAmount * (line.subtotal_before_discount / eligibleSubtotal)
      : 0;
    const lineDiscount = roundMoney(
      Math.min(
        line.subtotal_before_discount,
        isLast ? candidate.discountAmount - allocated : rawShare,
      ),
    );
    const adjustment: PromoAdjustment = {
      promo_id: candidate.promo.id,
      promo_name: candidate.promo.name,
      scope: 'line',
      product_id: line.product_id,
      amount: lineDiscount,
      reason: `${candidate.promo.name} (${candidate.promo.type === 'percent' ? 'persen' : 'nominal'})`,
    };

    allocated = roundMoney(allocated + lineDiscount);
    line.discount_amount = roundMoney(line.discount_amount + lineDiscount);
    line.final_subtotal = roundMoney(line.subtotal_before_discount - line.discount_amount);
    line.final_unit_price = line.quantity > 0 ? roundMoney(line.final_subtotal / line.quantity) : 0;
    line.adjustments = [...line.adjustments, adjustment];
    adjustments.push(adjustment);
  });

  const roundingDiff = roundMoney(candidate.discountAmount - allocated);
  if (roundingDiff !== 0 && candidate.eligibleLineIndexes.length > 0) {
    const lastLine = lines[candidate.eligibleLineIndexes[candidate.eligibleLineIndexes.length - 1]];
    const lastAdjustment = adjustments[adjustments.length - 1];

    lastLine.discount_amount = roundMoney(lastLine.discount_amount + roundingDiff);
    lastLine.final_subtotal = roundMoney(lastLine.subtotal_before_discount - lastLine.discount_amount);
    lastLine.final_unit_price = lastLine.quantity > 0 ? roundMoney(lastLine.final_subtotal / lastLine.quantity) : 0;

    if (lastAdjustment) {
      lastAdjustment.amount = roundMoney(lastAdjustment.amount + roundingDiff);
    }
  }

  return adjustments.filter((adjustment) => adjustment.amount > 0);
};

const sanitizePromoInput = (input: PromoFormInput): PromoFormInput => {
  const name = input.name.trim();
  const value = Number(input.value);
  const priority = Number(input.priority);
  const productIds = input.product_ids?.filter(Boolean) ?? [];
  const categories = input.categories?.filter(Boolean) ?? [];
  const startAt = input.start_at || null;
  const endAt = input.end_at || null;

  if (!name) {
    throw new Error('Nama promo wajib diisi.');
  }

  if (!Number.isFinite(value) || value <= 0) {
    throw new Error('Nilai promo harus lebih besar dari 0.');
  }

  if (input.type === 'percent' && value > 100) {
    throw new Error('Diskon persen tidak boleh lebih dari 100%.');
  }

  if (!Number.isFinite(priority)) {
    throw new Error('Priority promo tidak valid.');
  }

  if (input.applies_to === 'product' && productIds.length === 0) {
    throw new Error('Promo produk wajib memilih minimal satu produk.');
  }

  if (input.applies_to === 'category' && categories.length === 0) {
    throw new Error('Promo kategori wajib memilih minimal satu kategori.');
  }

  if (startAt && endAt && new Date(startAt).getTime() > new Date(endAt).getTime()) {
    throw new Error('Tanggal mulai promo tidak boleh melewati tanggal selesai.');
  }

  return {
    name,
    type: input.type,
    value,
    applies_to: input.applies_to,
    product_ids: input.applies_to === 'product' ? productIds : [],
    categories: input.applies_to === 'category' ? categories : [],
    start_at: startAt,
    end_at: endAt,
    min_qty: normalizeOptionalNumber(input.min_qty),
    min_total: normalizeOptionalNumber(input.min_total),
    voucher_code: normalizeVoucherCode(input.voucher_code),
    active: Boolean(input.active),
    priority,
  };
};

export const getActivePromos = async (now: Date = new Date()): Promise<Promo[]> => {
  const promos = await db.promos.toArray();
  return promos.filter((promo) => promo.active && isPromoInDateRange(promo, now));
};

export const evaluatePromos = ({
  cart,
  promos,
  voucherCode,
  now = new Date(),
}: EvaluatePromoInput): PromoEvaluationResult => {
  const lines = createBaseLines(cart);
  const subtotalBeforeDiscount = roundMoney(
    lines.reduce((sum, line) => sum + line.subtotal_before_discount, 0),
  );
  const candidates = promos
    .filter((promo) => promo.active)
    .filter((promo) => isPromoInDateRange(promo, now))
    .filter((promo) => isPromoVoucherMatched(promo, voucherCode))
    .map((promo) => createPromoCandidate(promo, cart, lines))
    .filter((candidate): candidate is PromoCandidate => Boolean(candidate));
  const bestCandidate = pickBestCandidate(candidates);

  if (!bestCandidate) {
    return {
      subtotal_before_discount: subtotalBeforeDiscount,
      discount_amount: 0,
      total_amount: subtotalBeforeDiscount,
      lines,
      applied_promos_snapshot: [],
      discount_breakdown: [],
    };
  }

  const adjustments = allocateDiscountToLines(bestCandidate, lines);
  const discountAmount = roundMoney(adjustments.reduce((sum, adjustment) => sum + adjustment.amount, 0));
  const totalAmount = roundMoney(subtotalBeforeDiscount - discountAmount);

  return {
    subtotal_before_discount: subtotalBeforeDiscount,
    discount_amount: discountAmount,
    total_amount: totalAmount,
    lines,
    applied_promos_snapshot: [
      {
        promo_id: bestCandidate.promo.id,
        name: bestCandidate.promo.name,
        type: bestCandidate.promo.type,
        value: bestCandidate.promo.value,
        applies_to: bestCandidate.promo.applies_to,
        product_ids: bestCandidate.promo.product_ids,
        categories: bestCandidate.promo.categories,
        voucher_code: bestCandidate.promo.voucher_code,
        adjustments,
      },
    ],
    discount_breakdown: [{ label: bestCandidate.promo.name, amount: discountAmount }],
  };
};

export const createPromo = async (input: PromoFormInput): Promise<Promo> => {
  const currentUser = await getCurrentSessionUser();
  await requireUserPermission(currentUser, 'PROMO_MANAGE');

  const now = new Date().toISOString();
  const promo: Promo = {
    id: crypto.randomUUID(),
    ...sanitizePromoInput(input),
    created_by: currentUser?.id,
    created_at: now,
    updated_at: now,
  };

  await db.promos.add(promo);
  await writeActivityLog({
    user: currentUser,
    action: 'PROMO_CREATED',
    entity: 'promos',
    entity_id: promo.id,
    description: `${currentUser?.name ?? 'User'} membuat promo ${promo.name}.`,
  });

  return promo;
};

export const updatePromo = async (promoId: string, input: PromoFormInput): Promise<Promo> => {
  const currentUser = await getCurrentSessionUser();
  await requireUserPermission(currentUser, 'PROMO_MANAGE');

  const existingPromo = await db.promos.get(promoId);
  if (!existingPromo) {
    throw new Error('Promo tidak ditemukan.');
  }

  const updatedPromo: Promo = {
    ...existingPromo,
    ...sanitizePromoInput(input),
    updated_at: new Date().toISOString(),
  };

  await db.promos.put(updatedPromo);
  await writeActivityLog({
    user: currentUser,
    action: 'PROMO_UPDATED',
    entity: 'promos',
    entity_id: promoId,
    description: `${currentUser?.name ?? 'User'} memperbarui promo ${updatedPromo.name}.`,
  });

  return updatedPromo;
};

export const deletePromo = async (promoId: string): Promise<void> => {
  const currentUser = await getCurrentSessionUser();
  await requireUserPermission(currentUser, 'PROMO_MANAGE');

  const promo = await db.promos.get(promoId);
  if (!promo) {
    throw new Error('Promo tidak ditemukan.');
  }

  await db.promos.delete(promoId);
  await writeActivityLog({
    user: currentUser,
    action: 'PROMO_DELETED',
    entity: 'promos',
    entity_id: promoId,
    description: `${currentUser?.name ?? 'User'} menghapus promo ${promo.name}.`,
  });
};
