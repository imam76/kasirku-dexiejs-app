import { Card, InputNumber, Select } from 'antd';
import { Controller } from 'react-hook-form';
import type { Control } from 'react-hook-form';
import type { SalesDocumentConfig } from '@/configs/sales-document';
import { useI18n } from '@/hooks/useI18n';
import type { SalesDocument, Tax } from '@/types';
import { formatCurrency } from '@/utils/formatters';
import { taxCalculationModeLabelKeys } from '@/utils/salesDocuments/i18n';
import type { SalesDocumentFormValues } from './SalesDocumentForm';

interface DocumentSummaryProps {
  config: SalesDocumentConfig;
  control: Control<SalesDocumentFormValues>;
  total: Pick<SalesDocument, 'subtotal_amount' | 'discount_amount' | 'tax_amount' | 'total_amount'>;
  taxes: Tax[];
  discountAmount: number;
  onDiscountChange: (value: number) => void;
  onTaxChange: (taxId?: string) => void;
}

export const DocumentSummary = ({
  config,
  control,
  total,
  taxes,
  discountAmount,
  onDiscountChange,
  onTaxChange,
}: DocumentSummaryProps) => {
  const { t } = useI18n();

  if (!config.behavior.hasPricing) return null;

  return (
    <Card size="small" className="ml-auto w-full max-w-md">
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-4">
          <span className="text-sm text-gray-500">{t('salesDocuments.field.subtotal')}</span>
          <span className="font-medium text-gray-900">Rp {formatCurrency(total.subtotal_amount || 0)}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-sm text-gray-500">{t('salesDocuments.field.documentDiscount')}</span>
          <InputNumber
            min={0}
            className="w-40"
            value={discountAmount}
            onChange={(value) => onDiscountChange(Number(value || 0))}
          />
        </div>
        {config.behavior.hasTax && (
          <>
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <span className="text-sm text-gray-500">{t('salesDocuments.field.documentTax')}</span>
              <Controller
                name="tax_id"
                control={control}
                render={({ field }) => (
                  <Select
                    className="w-full sm:w-56"
                    allowClear
                    showSearch={{ optionFilterProp: 'label' }}
                    placeholder={t('salesDocuments.placeholder.tax')}
                    value={field.value as string | undefined}
                    onBlur={field.onBlur}
                    options={taxes.map((tax) => ({
                      value: tax.id,
                      label: `${tax.name} (${tax.rate}%, ${t(taxCalculationModeLabelKeys[tax.calculation_mode])})`,
                    }))}
                    onChange={(taxId) => {
                      field.onChange(taxId);
                      onTaxChange(taxId);
                    }}
                  />
                )}
              />
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm text-gray-500">{t('salesDocuments.field.tax')}</span>
              <span className="font-medium text-gray-900">Rp {formatCurrency(total.tax_amount || 0)}</span>
            </div>
          </>
        )}
        <div className="flex items-center justify-between gap-4 border-t border-gray-100 pt-3">
          <span className="text-sm font-medium text-gray-700">{t('salesDocuments.field.total')}</span>
          <span className="text-lg font-semibold text-gray-900">Rp {formatCurrency(total.total_amount || 0)}</span>
        </div>
      </div>
    </Card>
  );
};
