import { getCurrentSessionUser, requireUserPermission, requireRolePermission, writeActivityLog } from '@/auth/authService';
import { db } from '@/lib/db';
import { contactSchema } from '@/lib/validations/contact';
import type { PromoEvaluationResult } from '@/services/promoService';
import { enqueueContactSync } from '@/services/syncQueueService';
import type {
  AuthUser,
  CartItem,
  Contact,
  MembershipPointTransaction,
  MembershipPointTransactionType,
  MembershipSetting,
} from '@/types';

export const DEFAULT_MEMBERSHIP_SETTING_ID = 'default';
export const DEFAULT_MEMBERSHIP_SETTING: Omit<MembershipSetting, 'created_at' | 'updated_at'> = {
  id: DEFAULT_MEMBERSHIP_SETTING_ID,
  earning_amount: 1000,
  earning_points: 1,
  point_value: 1,
  redeem_enabled: true,
};

export interface MembershipSettingInput {
  earning_amount: number;
  earning_points: number;
  point_value: number;
  redeem_enabled: boolean;
}

export interface QuickCreateMemberInput {
  name: string;
  phone?: string;
  email?: string;
}

export interface MembershipPreviewInput {
  cart: CartItem[];
  promoEvaluation: PromoEvaluationResult;
  member?: Contact | null;
  redeemPoints?: number;
  setting?: MembershipSetting;
}

export interface MembershipCheckoutEvaluation {
  member?: Contact;
  setting: MembershipSetting;
  redeem_points: number;
  redeem_amount: number;
  earned_points: number;
  total_after_redeem: number;
  discount_breakdown: Array<{ label: string; amount: number }>;
  line_redeem_discounts: number[];
}

export interface RecordPointInput {
  member: Contact;
  transactionId: string;
  transactionNumber: string;
  type: MembershipPointTransactionType;
  pointsDelta: number;
  amountValue: number;
  balanceAfter: number;
  reason: string;
  actor?: AuthUser | null;
  createdAt: string;
}

const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

const normalizePositiveNumber = (value: unknown, fallback: number) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
};

const normalizeNonNegativeInteger = (value: unknown) => {
  const numeric = Math.floor(Number(value));
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
};

const normalizeMemberNumber = (value?: string | null) => value?.trim().toUpperCase() || undefined;

export const buildDefaultMembershipSetting = (now: string): MembershipSetting => ({
  ...DEFAULT_MEMBERSHIP_SETTING,
  created_at: now,
  updated_at: now,
});

export const ensureMembershipSetting = async (): Promise<MembershipSetting> => {
  const existing = await db.membershipSettings.get(DEFAULT_MEMBERSHIP_SETTING_ID);
  if (existing) return existing;

  const now = new Date().toISOString();
  const setting = buildDefaultMembershipSetting(now);
  await db.membershipSettings.put(setting);
  return setting;
};

export const getMembershipSetting = async (): Promise<MembershipSetting> => ensureMembershipSetting();

export const saveMembershipSetting = async (input: MembershipSettingInput): Promise<MembershipSetting> => {
  const currentUser = await getCurrentSessionUser();
  requireRolePermission(currentUser?.role, 'SETTINGS_ACCESS');

  const current = await ensureMembershipSetting();
  const now = new Date().toISOString();
  const setting: MembershipSetting = {
    ...current,
    earning_amount: normalizePositiveNumber(input.earning_amount, DEFAULT_MEMBERSHIP_SETTING.earning_amount),
    earning_points: normalizePositiveNumber(input.earning_points, DEFAULT_MEMBERSHIP_SETTING.earning_points),
    point_value: normalizePositiveNumber(input.point_value, DEFAULT_MEMBERSHIP_SETTING.point_value),
    redeem_enabled: Boolean(input.redeem_enabled),
    updated_at: now,
  };

  await db.membershipSettings.put(setting);
  await writeActivityLog({
    user: currentUser,
    action: 'MEMBERSHIP_SETTING_UPDATED',
    entity: 'membershipSettings',
    entity_id: setting.id,
    description: `${currentUser?.name ?? 'User'} memperbarui pengaturan membership.`,
  });

  return setting;
};

export const generateMembershipNumber = async (now = new Date()) => {
  const dateKey = now.toISOString().slice(0, 10).replace(/-/g, '');

  for (let sequence = 1; sequence <= 9999; sequence += 1) {
    const candidate = `MBR-${dateKey}-${String(sequence).padStart(4, '0')}`;
    const existing = await db.contacts.where('membership_number').equals(candidate).first();
    if (!existing) return candidate;
  }

  return `MBR-${dateKey}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
};

export const isActiveRetailMember = (contact?: Contact | null): contact is Contact => (
  Boolean(contact?.is_active && contact.is_member && (contact.membership_status ?? 'ACTIVE') === 'ACTIVE')
);

const withPendingSync = (contact: Contact): Contact => ({
  ...contact,
  sync_status: 'pending',
  sync_error: undefined,
});

const sanitizeQuickMemberInput = (input: QuickCreateMemberInput) => {
  return contactSchema.parse({
    name: input.name,
    contact_type: 'CUSTOMER',
    phone: input.phone,
    email: input.email,
    is_active: true,
    is_member: true,
  });
};

export const createRetailMemberFromPos = async (input: QuickCreateMemberInput): Promise<Contact> => {
  const currentUser = await getCurrentSessionUser();
  await requireUserPermission(currentUser, 'CASHIER_ACCESS');

  const parsed = sanitizeQuickMemberInput(input);
  const now = new Date().toISOString();
  const contact: Contact = withPendingSync({
    id: crypto.randomUUID(),
    name: parsed.name,
    contact_type: 'CUSTOMER',
    phone: parsed.phone,
    email: parsed.email,
    is_active: true,
    is_member: true,
    membership_number: await generateMembershipNumber(new Date(now)),
    membership_status: 'ACTIVE',
    membership_joined_at: now,
    membership_points_balance: 0,
    created_at: now,
    updated_at: now,
  });

  await db.contacts.add(contact);
  await enqueueContactSync(contact, 'create');
  await writeActivityLog({
    user: currentUser,
    action: 'MEMBER_CREATED_FROM_POS',
    entity: 'contacts',
    entity_id: contact.id,
    description: `${currentUser?.name ?? 'User'} membuat member ${contact.name} dari POS.`,
  });

  return contact;
};

const getRedeemAmountFromPoints = (points: number, setting: MembershipSetting) => (
  roundMoney(points * normalizePositiveNumber(setting.point_value, DEFAULT_MEMBERSHIP_SETTING.point_value))
);

export const calculateEarnedPoints = (netAmount: number, setting: MembershipSetting) => {
  const amountBasis = normalizePositiveNumber(setting.earning_amount, DEFAULT_MEMBERSHIP_SETTING.earning_amount);
  const pointsPerBasis = normalizePositiveNumber(setting.earning_points, DEFAULT_MEMBERSHIP_SETTING.earning_points);

  if (netAmount <= 0) return 0;
  return Math.floor(netAmount / amountBasis) * pointsPerBasis;
};

const allocateRedeemDiscountToLines = (
  promoEvaluation: PromoEvaluationResult,
  redeemAmount: number,
) => {
  const lineDiscounts = promoEvaluation.lines.map(() => 0);
  if (redeemAmount <= 0 || promoEvaluation.total_amount <= 0) return lineDiscounts;

  let allocated = 0;
  promoEvaluation.lines.forEach((line, index) => {
    const isLast = index === promoEvaluation.lines.length - 1;
    const rawShare = redeemAmount * (line.final_subtotal / promoEvaluation.total_amount);
    const lineDiscount = roundMoney(Math.min(
      line.final_subtotal,
      isLast ? redeemAmount - allocated : rawShare,
    ));
    lineDiscounts[index] = lineDiscount;
    allocated = roundMoney(allocated + lineDiscount);
  });

  const roundingDiff = roundMoney(redeemAmount - allocated);
  if (roundingDiff !== 0 && lineDiscounts.length > 0) {
    lineDiscounts[lineDiscounts.length - 1] = roundMoney(lineDiscounts[lineDiscounts.length - 1] + roundingDiff);
  }

  return lineDiscounts;
};

export const evaluateMembershipCheckout = async ({
  cart,
  promoEvaluation,
  member,
  redeemPoints,
  setting,
}: MembershipPreviewInput): Promise<MembershipCheckoutEvaluation> => {
  const resolvedSetting = setting ?? await ensureMembershipSetting();
  return evaluateMembershipCheckoutSync({
    cart,
    promoEvaluation,
    member,
    redeemPoints,
    setting: resolvedSetting,
  });
};

export const evaluateMembershipCheckoutSync = ({
  cart,
  promoEvaluation,
  member,
  redeemPoints,
  setting,
}: MembershipPreviewInput & { setting: MembershipSetting }): MembershipCheckoutEvaluation => {
  const resolvedSetting = setting;
  const activeMember = isActiveRetailMember(member) ? member : undefined;
  const requestedRedeemPoints = normalizeNonNegativeInteger(redeemPoints);

  if (!activeMember || cart.length === 0) {
    return {
      setting: resolvedSetting,
      redeem_points: 0,
      redeem_amount: 0,
      earned_points: 0,
      total_after_redeem: promoEvaluation.total_amount,
      discount_breakdown: promoEvaluation.discount_breakdown,
      line_redeem_discounts: promoEvaluation.lines.map(() => 0),
    };
  }

  const currentBalance = Math.max(0, Math.floor(Number(activeMember.membership_points_balance || 0)));
  const maxRedeemByTotal = resolvedSetting.redeem_enabled && resolvedSetting.point_value > 0
    ? Math.floor(promoEvaluation.total_amount / resolvedSetting.point_value)
    : 0;
  const redeem_points = Math.min(requestedRedeemPoints, currentBalance, maxRedeemByTotal);
  const redeem_amount = roundMoney(Math.min(getRedeemAmountFromPoints(redeem_points, resolvedSetting), promoEvaluation.total_amount));
  const total_after_redeem = roundMoney(promoEvaluation.total_amount - redeem_amount);
  const earned_points = calculateEarnedPoints(total_after_redeem, resolvedSetting);
  const line_redeem_discounts = allocateRedeemDiscountToLines(promoEvaluation, redeem_amount);
  const discount_breakdown = redeem_amount > 0
    ? [...promoEvaluation.discount_breakdown, { label: 'Redeem poin member', amount: redeem_amount }]
    : promoEvaluation.discount_breakdown;

  return {
    member: activeMember,
    setting: resolvedSetting,
    redeem_points,
    redeem_amount,
    earned_points,
    total_after_redeem,
    discount_breakdown,
    line_redeem_discounts,
  };
};

export const recordMembershipPointTransaction = async ({
  member,
  transactionId,
  transactionNumber,
  type,
  pointsDelta,
  amountValue,
  balanceAfter,
  reason,
  actor,
  createdAt,
}: RecordPointInput): Promise<MembershipPointTransaction> => {
  const ledger: MembershipPointTransaction = {
    id: crypto.randomUUID(),
    contact_id: member.id,
    membership_number: normalizeMemberNumber(member.membership_number),
    member_name: member.name,
    transaction_id: transactionId,
    transaction_number: transactionNumber,
    type,
    points_delta: pointsDelta,
    amount_value: roundMoney(amountValue),
    balance_after: balanceAfter,
    reason,
    created_at: createdAt,
    created_by: actor?.id,
    created_by_name: actor?.name,
  };

  await db.membershipPointTransactions.add(ledger);
  return ledger;
};
