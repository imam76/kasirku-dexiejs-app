import { Button, Card, InputNumber, Segmented, Select, Tooltip } from 'antd';
import { Settings } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Controller } from 'react-hook-form';
import type { Control } from 'react-hook-form';
import { useLiveQuery } from 'dexie-react-hooks';
import type { SalesDocumentConfig } from '@/configs/sales-document';
import { DocumentDiscountSettingsModal } from '@/components/DocumentDiscountSettingsModal';
import { useI18n } from '@/hooks/useI18n';
import { db } from '@/lib/db';
import type { PromoType, SalesDocument, Tax } from '@/types';
import { getDefaultDocumentDiscountAccount } from '@/utils/chartOfAccounts/getDocumentDiscountAccountSnapshot';
import {
  formatDocumentCurrencyAmount,
  isBaseCurrency,
  toBaseCurrencyAmount,
  toDocumentCurrencyAmount,
  type DocumentCurrencySnapshot,
} from '@/utils/documentCurrency';
import { formatCurrency } from '@/utils/formatters';
import { taxCalculationModeLabelKeys } from '@/utils/salesDocuments/i18n';
import type { SalesDocumentFormValues } from './SalesDocumentForm';

interface DocumentSummaryProps {
  config: SalesDocumentConfig;
  control: Control<SalesDocumentFormValues>;
  total: Pick<SalesDocument, 'subtotal_amount' | 'discount_amount' | 'tax_amount' | 'total_amount'>;
  documentCurrencySnapshot: DocumentCurrencySnapshot;
  taxes: Tax[];
  discountType: PromoType;
  discountValue: number;
  onDiscountTypeChange: (value: PromoType) => void;
  onDiscountValueChange: (value: number) => void;
  onTaxChange: (taxId?: string) => void;
}

export const DocumentSummary = ({
  config,
  control,
  total,
  documentCurrencySnapshot,
  taxes,
  discountType,
  discountValue,
  onDiscountTypeChange,
  onDiscountValueChange,
  onTaxChange,
}: DocumentSummaryProps) => {
  const { t } = useI18n();
  const [isDiscountSettingsOpen, setIsDiscountSettingsOpen] = useState(false);
  const discountAccounts = useLiveQuery(
    () => db.chartOfAccounts
      .where('type')
      .equals('CONTRA_REVENUE')
      .filter((account) => account.is_active && account.is_postable)
      .toArray(),
    [],
    [],
  );
  const accountOptions = useMemo(() => discountAccounts.map((account) => ({
    value: account.id,
    label: `${account.code} - ${account.name}`,
  })), [discountAccounts]);
  const defaultDiscountAccount = useMemo(
    () => getDefaultDocumentDiscountAccount('sales', discountAccounts),
    [discountAccounts],
  );
  const isForeignCurrency = !isBaseCurrency(documentCurrencySnapshot.currency_code);
  const displayedDiscountValue = discountType === 'fixed'
    ? toDocumentCurrencyAmount(discountValue, documentCurrencySnapshot)
    : discountValue;
  const renderMoney = (amount?: number, className = 'font-medium text-gray-900') => (
    <span className="text-right">
      <span className={className}>
        {formatDocumentCurrencyAmount(
          toDocumentCurrencyAmount(amount, documentCurrencySnapshot),
          documentCurrencySnapshot,
        )}
      </span>
      {isForeignCurrency && (
        <span className="block text-[11px] font-normal text-gray-400">
          Rp {formatCurrency(amount || 0)}
        </span>
      )}
    </span>
  );

  if (!config.behavior.hasPricing) return null;

  return (
    <Card size="small" className="ml-auto w-full max-w-md">
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-4">
          <span className="text-sm text-gray-500">{t('salesDocuments.field.subtotal')}</span>
          {renderMoney(total.subtotal_amount)}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <span className="text-sm text-gray-500">{t('salesDocuments.field.documentDiscount')}</span>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <Segmented
              size="small"
              value={discountType}
              options={[
                { value: 'fixed', label: t('salesDocuments.discountType.fixed') },
                { value: 'percent', label: t('salesDocuments.discountType.percent') },
              ]}
              onChange={(value) => onDiscountTypeChange(value as PromoType)}
            />
            <InputNumber
              min={0}
              max={discountType === 'percent' ? 100 : undefined}
              className="w-full sm:w-32"
              value={displayedDiscountValue}
              addonAfter={discountType === 'percent' ? '%' : undefined}
              onChange={(value) => onDiscountValueChange(discountType === 'fixed'
                ? toBaseCurrencyAmount(Number(value || 0), documentCurrencySnapshot)
                : Number(value || 0))}
            />
            <Tooltip title={t('salesDocuments.field.discountAccount')}>
              <Button
                type="default"
                icon={<Settings size={16} />}
                aria-label={t('salesDocuments.field.discountAccount')}
                onClick={() => setIsDiscountSettingsOpen(true)}
              />
            </Tooltip>
          </div>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-sm text-gray-500">{t('salesDocuments.field.discountAmount')}</span>
          {renderMoney(total.discount_amount)}
        </div>
        <Controller
          name="discount_account_id"
          control={control}
          render={({ field }) => (
            <DocumentDiscountSettingsModal
              open={isDiscountSettingsOpen}
              title={t('salesDocuments.field.documentDiscount')}
              accountLabel={t('salesDocuments.field.discountAccount')}
              accountPlaceholder={t('salesDocuments.placeholder.discountAccount')}
              accountValue={field.value as string | undefined}
              defaultAccountValue={defaultDiscountAccount?.id}
              accountOptions={accountOptions}
              onAccountChange={field.onChange}
              onClose={() => setIsDiscountSettingsOpen(false)}
            />
          )}
        />
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
              {renderMoney(total.tax_amount)}
            </div>
          </>
        )}
        <div className="flex items-center justify-between gap-4 border-t border-gray-100 pt-3">
          <span className="text-sm font-medium text-gray-700">{t('salesDocuments.field.total')}</span>
          {renderMoney(total.total_amount, 'text-lg font-semibold text-gray-900')}
        </div>
      </div>
    </Card>
  );
};
