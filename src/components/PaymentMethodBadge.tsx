import { CreditCard, DollarSign, Landmark, QrCode, ShoppingBag } from 'lucide-react';
import type { PaymentMethodCategory } from '@/types';

interface PaymentMethodBadgeProps {
  name: string;
  category: PaymentMethodCategory;
  className?: string;
}

const presentationByCategory = {
  CASH: { Icon: DollarSign, className: 'bg-green-100 text-green-700' },
  QRIS: { Icon: QrCode, className: 'bg-purple-100 text-purple-700' },
  BANK_TRANSFER: { Icon: Landmark, className: 'bg-blue-100 text-blue-700' },
  MARKETPLACE: { Icon: ShoppingBag, className: 'bg-orange-100 text-orange-700' },
  OTHER: { Icon: CreditCard, className: 'bg-gray-100 text-gray-700' },
} satisfies Record<PaymentMethodCategory, { Icon: typeof CreditCard; className: string }>;

export default function PaymentMethodBadge({
  name,
  category,
  className = '',
}: PaymentMethodBadgeProps) {
  const { Icon, className: colorClassName } = presentationByCategory[category];
  const normalizedName = name.trim();

  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold ${colorClassName} ${className}`}
    >
      <Icon size={12} className="shrink-0" />
      <span>{normalizedName}</span>
    </span>
  );
}
