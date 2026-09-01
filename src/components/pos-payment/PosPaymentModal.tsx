import { AutoComplete, Modal, Select } from 'antd';
import { TicketPercent, UserCheck } from 'lucide-react';
import { useMemo } from 'react';
import type { Membership, Promo } from '@/types';
import type { PosPaymentMethodOption } from '@/hooks/usePosPaymentMethods';
import type { MembershipCheckoutEvaluation } from '@/services/membershipService';
import type { PromoEvaluationResult } from '@/services/promoService';
import type { PosPaymentDraft } from '@/store/transactionStore';
import type { PosPaymentAllocationResult } from '@/utils/posSplitPayment';
import { buildPosVoucherOptions, calculatePosDiscountTotal, isAppliedPosVoucher } from '@/utils/posVoucher';
import { formatCurrency } from '@/utils/formatters';
import { useI18n } from '@/hooks/useI18n';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import PosSplitPaymentEditor from './PosSplitPaymentEditor';

const PAYMENT_DIALOG_VIEWPORT_QUERY = '(min-width: 1024px)';

interface PosPaymentModalProps {
  open: boolean;
  total: number;
  paymentDrafts: PosPaymentDraft[];
  paymentPreview: PosPaymentAllocationResult;
  paymentMethods: PosPaymentMethodOption[];
  voucherCode: string;
  memberId?: string;
  activePromos: Promo[];
  activeMembers: Membership[];
  promoPreview: PromoEvaluationResult;
  membershipPreview: MembershipCheckoutEvaluation;
  onVoucherCodeChange: (voucherCode: string) => void;
  onMemberChange: (memberId?: string) => void;
  onAddPayment: () => void;
  onUpdatePayment: (clientId: string, patch: Partial<PosPaymentDraft>) => void;
  onRemovePayment: (clientId: string) => void;
  onConfirm: () => Promise<boolean>;
  onRecordExpense: () => Promise<boolean>;
  onClose: () => void;
}

export default function PosPaymentModal({
  open,
  total,
  paymentDrafts,
  paymentPreview,
  paymentMethods,
  voucherCode,
  memberId,
  activePromos,
  activeMembers,
  promoPreview,
  membershipPreview,
  onVoucherCodeChange,
  onMemberChange,
  onAddPayment,
  onUpdatePayment,
  onRemovePayment,
  onConfirm,
  onRecordExpense,
  onClose,
}: PosPaymentModalProps) {
  const { t } = useI18n();
  const supportsPaymentDialog = useMediaQuery(PAYMENT_DIALOG_VIEWPORT_QUERY);
  const voucherOptions = useMemo(() => buildPosVoucherOptions(activePromos), [activePromos]);
  const memberOptions = useMemo(() => activeMembers.map((member) => ({
    value: member.id,
    label: `${member.member_number} - ${member.name ?? member.phone}`,
    searchText: `${member.member_number} ${member.name ?? ''} ${member.phone}`,
  })), [activeMembers]);
  const selectedMember = useMemo(
    () => activeMembers.find((member) => member.id === memberId),
    [activeMembers, memberId],
  );
  const voucherValue = voucherCode.trim();
  const hasAppliedVoucher = isAppliedPosVoucher(voucherValue, promoPreview.applied_promos_snapshot);

  if (!supportsPaymentDialog) return null;

  return (
    <Modal
      title={t('payment.title')}
      open={open}
      onCancel={onClose}
      footer={null}
      width={920}
      centered
      destroyOnHidden
      zIndex={1100}
      styles={{
        body: {
          overflow: 'hidden',
          paddingBottom: 0,
        },
      }}
    >
      <div className="flex max-h-[calc(100dvh-160px)] min-h-0 flex-col gap-5 pt-2">
        <div className="grid gap-3 min-[768px]:grid-cols-2">
          <section className="min-w-0 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex shrink-0 items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                <UserCheck size={14} className="text-blue-600" />
                <span>Member</span>
              </div>
              <Select
                allowClear
                showSearch
                className="ml-auto w-48 min-w-0 flex-none"
                value={memberId}
                placeholder="Pilih member"
                optionFilterProp="label"
                onChange={(value) => onMemberChange(value)}
                options={memberOptions}
                filterOption={(input, option) => String(option?.searchText ?? option?.label ?? '').toLowerCase().includes(input.toLowerCase())}
                styles={{ popup: { root: { zIndex: 1200 } } }}
              />
            </div>
            {selectedMember ? (
              <div className="mt-2 rounded-lg border border-blue-100 bg-blue-50/70 px-3 py-2 text-xs font-semibold text-blue-700">
                <p className="truncate" title={`${selectedMember.member_number} - ${selectedMember.name ?? selectedMember.phone}`}>
                  {selectedMember.member_number} - {selectedMember.name ?? selectedMember.phone}
                </p>
              </div>
            ) : null}
          </section>
          <section className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex shrink-0 items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                <TicketPercent size={14} className="text-blue-600" />
                <span>Voucher</span>
              </div>
              <AutoComplete
                data-testid="pos-payment-voucher-input"
                allowClear
                value={voucherCode || undefined}
                options={voucherOptions}
                onChange={(value) => onVoucherCodeChange(String(value ?? ''))}
                filterOption={(input, option) => String(option?.searchText ?? option?.label ?? '')
                  .toLowerCase()
                  .includes(input.trim().toLowerCase())}
                placeholder={t('promo.voucherPlaceholder')}
                notFoundContent="Ketik kode voucher untuk memasukkan secara manual"
                className="ml-auto w-48 min-w-0 flex-none"
                styles={{ popup: { root: { zIndex: 1200 } } }}
              />
            </div>
            {voucherValue && promoPreview.discount_breakdown.length > 0 ? (
              <div className="mt-2 space-y-1.5 rounded-lg border border-emerald-100 bg-emerald-50/70 px-3 py-2 text-xs">
                {promoPreview.discount_breakdown.map((discount) => (
                  <div key={discount.label} className="flex justify-between gap-3 font-semibold text-emerald-700">
                    <span className="truncate">{discount.label}</span>
                    <span className="shrink-0">-Rp {formatCurrency(discount.amount)}</span>
                  </div>
                ))}
              </div>
            ) : null}
            {voucherValue && !hasAppliedVoucher ? (
              <div className="mt-2 rounded-lg border border-slate-200 bg-slate-100/70 px-3 py-2 text-xs font-semibold text-slate-500">
                {t('promo.noVoucherDiscount')}
              </div>
            ) : null}
          </section>
        </div>
        <PosSplitPaymentEditor
          total={total}
          discountAmount={calculatePosDiscountTotal(membershipPreview.discount_breakdown)}
          drafts={paymentDrafts}
          methods={paymentMethods}
          preview={paymentPreview}
          layout="dialog"
          showSectionTitles
          confirmLabel={t('payment.confirmPayment')}
          onAdd={onAddPayment}
          onUpdate={onUpdatePayment}
          onRemove={onRemovePayment}
          onConfirm={onConfirm}
          onRecordExpense={onRecordExpense}
          onCancel={onClose}
        />
      </div>
    </Modal>
  );
}
