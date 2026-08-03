import type { Contact } from '@/types';
import { Pencil, Sparkles, TicketPercent, UserRound } from 'lucide-react';
import { formatCurrency } from '@/utils/formatters';

interface PosCheckoutDetailsSummaryProps {
  selectedMember: Contact | null;
  voucherCode: string;
  discountAmount?: number;
  onEdit: () => void;
  className?: string;
  testId?: string;
  editButtonTestId?: string;
}

export default function PosCheckoutDetailsSummary({
  selectedMember,
  voucherCode,
  discountAmount = 0,
  onEdit,
  className = '',
  testId = 'pos-payment-checkout-details',
  editButtonTestId = 'pos-edit-checkout-details',
}: PosCheckoutDetailsSummaryProps) {
  return (
    <div
      data-testid={testId}
      className={`flex min-w-0 items-center gap-2.5 overflow-hidden rounded-xl bg-gradient-to-r from-blue-700 via-blue-600 to-indigo-700 p-3 text-white shadow-md shadow-blue-900/10 ring-1 ring-blue-500/20 ${className}`}
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/15 ring-1 ring-inset ring-white/20">
        <UserRound size={17} strokeWidth={2.25} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-bold uppercase tracking-wide text-blue-100">Member</div>
        <div className="truncate text-sm font-black text-white" title={selectedMember?.name ?? '-'}>
          {selectedMember?.name ?? 'Member belum dipilih'}
        </div>
      </div>
      <div className="flex min-w-0 shrink-0 items-center gap-1.5 rounded-md bg-white/10 px-2 py-1 text-[11px] font-bold ring-1 ring-inset ring-white/15">
        <TicketPercent size={11} className="shrink-0 text-blue-100" />
        <span className="max-w-32 truncate" title={voucherCode.trim() || '-'}>
          {voucherCode.trim() || 'Voucher'}
        </span>
      </div>
      {discountAmount > 0 ? (
        <div className="hidden min-w-0 shrink-0 items-center gap-1.5 rounded-md bg-emerald-300/20 px-2 py-1 text-[11px] font-black text-emerald-50 ring-1 ring-inset ring-emerald-200/30 sm:flex">
          <Sparkles size={11} className="shrink-0" />
          <span className="truncate">Hemat Rp {formatCurrency(discountAmount)}</span>
        </div>
      ) : null}
      <button
        type="button"
        data-testid={editButtonTestId}
        onClick={onEdit}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-white/20 bg-white/15 px-3 py-2 text-sm font-bold text-white transition-colors hover:bg-white/25"
      >
        <Pencil size={14} />
        Ubah
      </button>
    </div>
  );
}
