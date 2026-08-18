import { Tag } from 'antd';
import { AlertTriangle } from 'lucide-react';
import { useI18n } from '@/hooks/useI18n';
import type { SalesDocumentItem } from '@/types';
import type { DocumentCurrencySnapshot } from '@/utils/documentCurrency';
import { formatLineItemQuantitySummary } from '@/utils/salesDocuments/lineItemSummaryFormat';

interface LineItemSummaryCardProps {
  item: SalesDocumentItem;
  calculatedItem?: SalesDocumentItem;
  isDuplicate?: boolean;
  hasPricing: boolean;
  isSalesDelivery: boolean;
  documentCurrencySnapshot: DocumentCurrencySnapshot;
}

/** Ringkasan satu baris item: "Produk × qty unit → subtotal". Dipakai composer mobile (editable, di dalam card yang bisa diketuk) dan halaman detail (read-only). */
export const LineItemSummaryCard = ({
  item,
  calculatedItem,
  isDuplicate,
  hasPricing,
  isSalesDelivery,
  documentCurrencySnapshot,
}: LineItemSummaryCardProps) => {
  const { t } = useI18n();
  const displayedItem = calculatedItem ?? item;
  const hasDiscount = Number(item.discount_value ?? item.discount_amount ?? 0) > 0;
  const hasTax = Boolean(item.tax_id);

  return (
    <div className="space-y-1.5">
      <div className="flex min-w-0 items-start gap-2">
        {isDuplicate ? (
          <span
            title={t('documentLineItems.duplicateProduct')}
            className="mt-0.5 flex shrink-0 items-center text-amber-500"
          >
            <AlertTriangle size={14} />
          </span>
        ) : null}
        <span className="min-w-0 flex-1 truncate text-[15px] font-bold">
          {item.product_name || t('salesDocuments.placeholder.product')}
        </span>
      </div>
      <div className="text-xs text-gray-500 dark:text-gray-400">
        {formatLineItemQuantitySummary(displayedItem, { isSalesDelivery, hasPricing }, documentCurrencySnapshot)}
      </div>
      {hasPricing && (hasDiscount || hasTax) ? (
        <div className="flex flex-wrap gap-1.5">
          {hasDiscount ? <Tag className="m-0" color="blue">{t('salesDocuments.field.discount')}</Tag> : null}
          {hasTax ? <Tag className="m-0" color="purple">{t('salesDocuments.field.tax')}</Tag> : null}
        </div>
      ) : null}
    </div>
  );
};
