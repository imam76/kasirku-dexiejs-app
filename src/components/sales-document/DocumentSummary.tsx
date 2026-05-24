import { Card, InputNumber } from 'antd';
import type { SalesDocumentConfig } from '@/configs/sales-document';
import type { SalesDocument } from '@/types';
import { formatCurrency } from '@/utils/formatters';

interface DocumentSummaryProps {
  config: SalesDocumentConfig;
  total: Pick<SalesDocument, 'subtotal_amount' | 'discount_amount' | 'tax_amount' | 'total_amount'>;
  discountAmount: number;
  onDiscountChange: (value: number) => void;
}

export const DocumentSummary = ({
  config,
  total,
  discountAmount,
  onDiscountChange,
}: DocumentSummaryProps) => {
  if (!config.behavior.hasPricing) return null;

  return (
    <Card size="small" className="ml-auto w-full max-w-md">
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-4">
          <span className="text-sm text-gray-500">Subtotal</span>
          <span className="font-medium text-gray-900">Rp {formatCurrency(total.subtotal_amount || 0)}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-sm text-gray-500">Diskon Dokumen</span>
          <InputNumber
            min={0}
            className="w-40"
            value={discountAmount}
            onChange={(value) => onDiscountChange(Number(value || 0))}
          />
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-sm text-gray-500">Pajak</span>
          <span className="font-medium text-gray-900">Rp {formatCurrency(total.tax_amount || 0)}</span>
        </div>
        <div className="flex items-center justify-between gap-4 border-t border-gray-100 pt-3">
          <span className="text-sm font-medium text-gray-700">Total</span>
          <span className="text-lg font-semibold text-gray-900">Rp {formatCurrency(total.total_amount || 0)}</span>
        </div>
      </div>
    </Card>
  );
};
