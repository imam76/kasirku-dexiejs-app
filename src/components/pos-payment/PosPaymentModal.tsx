import { Modal } from 'antd';
import type { Contact } from '@/types';
import type { PosPaymentMethodOption } from '@/hooks/usePosPaymentMethods';
import type { MembershipCheckoutEvaluation } from '@/services/membershipService';
import type { PosPaymentDraft } from '@/store/transactionStore';
import type { PosPaymentAllocationResult } from '@/utils/posSplitPayment';
import { calculatePosDiscountTotal } from '@/utils/posVoucher';
import { useI18n } from '@/hooks/useI18n';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import PosCheckoutDetailsSummary from './PosCheckoutDetailsSummary';
import PosSplitPaymentEditor from './PosSplitPaymentEditor';

const PAYMENT_DIALOG_VIEWPORT_QUERY = '(min-width: 1024px)';

interface PosPaymentModalProps {
  open: boolean;
  total: number;
  paymentDrafts: PosPaymentDraft[];
  paymentPreview: PosPaymentAllocationResult;
  paymentMethods: PosPaymentMethodOption[];
  voucherCode: string;
  selectedMember: Contact | null;
  membershipPreview: MembershipCheckoutEvaluation;
  onAddPayment: () => void;
  onUpdatePayment: (clientId: string, patch: Partial<PosPaymentDraft>) => void;
  onRemovePayment: (clientId: string) => void;
  onConfirm: () => Promise<boolean>;
  onClose: () => void;
}

export default function PosPaymentModal({
  open,
  total,
  paymentDrafts,
  paymentPreview,
  paymentMethods,
  voucherCode,
  selectedMember,
  membershipPreview,
  onAddPayment,
  onUpdatePayment,
  onRemovePayment,
  onConfirm,
  onClose,
}: PosPaymentModalProps) {
  const { t } = useI18n();
  const supportsPaymentDialog = useMediaQuery(PAYMENT_DIALOG_VIEWPORT_QUERY);

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
      <div className="flex max-h-[calc(100dvh-160px)] min-h-0 flex-col gap-3 pt-2">
        <PosCheckoutDetailsSummary
          selectedMember={selectedMember}
          voucherCode={voucherCode}
          discountAmount={calculatePosDiscountTotal(membershipPreview.discount_breakdown)}
          onEdit={onClose}
        />
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
          onCancel={onClose}
        />
      </div>
    </Modal>
  );
}
