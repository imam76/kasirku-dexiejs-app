import { Card, InputNumber, Statistic } from 'antd';
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
    <Card size="small">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Statistic title="Subtotal" value={total.subtotal_amount || 0} formatter={(value) => `Rp ${formatCurrency(Number(value))}`} />
        <div>
          <div className="mb-1 text-sm text-gray-500">Diskon Dokumen</div>
          <InputNumber
            min={0}
            className="w-full"
            value={discountAmount}
            onChange={(value) => onDiscountChange(Number(value || 0))}
          />
        </div>
        <Statistic title="Pajak" value={total.tax_amount || 0} formatter={(value) => `Rp ${formatCurrency(Number(value))}`} />
        <Statistic title="Total" value={total.total_amount || 0} formatter={(value) => `Rp ${formatCurrency(Number(value))}`} />
      </div>
    </Card>
  );
};
