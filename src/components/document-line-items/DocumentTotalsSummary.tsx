import { useMemo, useState } from 'react';
import { Button, Card, InputNumber, Segmented, Select, Tooltip } from 'antd';
import { Settings } from 'lucide-react';
import { Controller } from 'react-hook-form';
import type { Control, FieldValues, Path } from 'react-hook-form';
import { useLiveQuery } from 'dexie-react-hooks';
import { DocumentDiscountSettingsModal } from '@/components/DocumentDiscountSettingsModal';
import { useI18n } from '@/hooks/useI18n';
import { db } from '@/lib/db';
import type { PromoType } from '@/types';
import { getDefaultDocumentDiscountAccount } from '@/utils/chartOfAccounts/getDocumentDiscountAccountSnapshot';
import {
  formatBaseCurrencyAmount,
  formatDocumentCurrencyAmount,
  isBaseCurrency,
  toBaseCurrencyAmount,
  toDocumentCurrencyAmount,
  type DocumentCurrencySnapshot,
} from '@/utils/documentCurrency';

interface Option {
  value: string;
  label: string;
}

export interface DocumentTotals {
  subtotal_amount?: number;
  discount_amount?: number;
  tax_amount?: number;
  total_amount?: number;
}

interface DocumentTotalsSummaryProps<TFieldValues extends FieldValues> {
  i18nPrefix: 'salesDocuments' | 'purchaseDocuments';
  discountPurpose: 'sales' | 'purchase';
  discountAccountType: 'CONTRA_REVENUE' | 'EXPENSE';
  control: Control<TFieldValues>;
  total: DocumentTotals;
  filledItemCount?: number;
  documentCurrencySnapshot: DocumentCurrencySnapshot;
  taxOptions: Option[];
  hasTax: boolean;
  discountType: PromoType;
  discountValue: number;
  onDiscountTypeChange: (value: PromoType) => void;
  onDiscountValueChange: (value: number) => void;
  onTaxChange: (taxId?: string) => void;
}

export const DocumentTotalsSummary = <TFieldValues extends FieldValues>({
  i18nPrefix,
  discountPurpose,
  discountAccountType,
  control,
  total,
  filledItemCount,
  documentCurrencySnapshot,
  taxOptions,
  hasTax,
  discountType,
  discountValue,
  onDiscountTypeChange,
  onDiscountValueChange,
  onTaxChange,
}: DocumentTotalsSummaryProps<TFieldValues>) => {
  const { t } = useI18n();
  const [isDiscountSettingsOpen, setIsDiscountSettingsOpen] = useState(false);
  const discountAccounts = useLiveQuery(
    () => db.chartOfAccounts
      .where('type')
      .equals(discountAccountType)
      .filter((account) => account.is_active && account.is_postable)
      .toArray(),
    [discountAccountType],
    [],
  );
  const accountOptions = useMemo(() => discountAccounts.map((account) => ({
    value: account.id,
    label: `${account.code} - ${account.name}`,
  })), [discountAccounts]);
  const defaultDiscountAccount = useMemo(
    () => getDefaultDocumentDiscountAccount(discountPurpose, discountAccounts),
    [discountAccounts, discountPurpose],
  );
  const isForeignCurrency = !isBaseCurrency(documentCurrencySnapshot.currency_code, documentCurrencySnapshot.base_currency_code);
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
          {formatBaseCurrencyAmount(amount || 0, documentCurrencySnapshot)}
        </span>
      )}
    </span>
  );

  return (
    <Card size="small" className="ml-auto w-full max-w-md">
      <div className="space-y-3">
        {filledItemCount !== undefined && (
          <div className="flex items-center justify-between gap-4">
            <span className="text-sm text-gray-500">{t('documentLineItems.itemCountLabel')}</span>
            <span className="text-right font-medium text-gray-900">{filledItemCount}</span>
          </div>
        )}
        <div className="flex items-center justify-between gap-4">
          <span className="text-sm text-gray-500">{t(`${i18nPrefix}.field.subtotal`)}</span>
          {renderMoney(total.subtotal_amount)}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <span className="text-sm text-gray-500">{t(`${i18nPrefix}.field.documentDiscount`)}</span>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <Segmented
              size="small"
              value={discountType}
              options={[
                { value: 'fixed', label: t(`${i18nPrefix}.discountType.fixed`) },
                { value: 'percent', label: t(`${i18nPrefix}.discountType.percent`) },
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
            <Tooltip title={t(`${i18nPrefix}.field.discountAccount`)}>
              <Button
                type="default"
                icon={<Settings size={16} />}
                aria-label={t(`${i18nPrefix}.field.discountAccount`)}
                onClick={() => setIsDiscountSettingsOpen(true)}
              />
            </Tooltip>
          </div>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-sm text-gray-500">{t(`${i18nPrefix}.field.discountAmount`)}</span>
          {renderMoney(total.discount_amount)}
        </div>
        <Controller
          name={'discount_account_id' as Path<TFieldValues>}
          control={control}
          render={({ field }) => (
            <DocumentDiscountSettingsModal
              open={isDiscountSettingsOpen}
              title={t(`${i18nPrefix}.field.documentDiscount`)}
              accountLabel={t(`${i18nPrefix}.field.discountAccount`)}
              accountPlaceholder={t(`${i18nPrefix}.placeholder.discountAccount`)}
              accountValue={field.value as string | undefined}
              defaultAccountValue={defaultDiscountAccount?.id}
              accountOptions={accountOptions}
              onAccountChange={field.onChange}
              onClose={() => setIsDiscountSettingsOpen(false)}
            />
          )}
        />
        {hasTax && (
          <>
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <span className="text-sm text-gray-500">{t(`${i18nPrefix}.field.documentTax`)}</span>
              <Controller
                name={'tax_id' as Path<TFieldValues>}
                control={control}
                render={({ field }) => (
                  <Select
                    className="w-full sm:w-56"
                    allowClear
                    showSearch={{ optionFilterProp: 'label' }}
                    placeholder={t(`${i18nPrefix}.placeholder.tax`)}
                    value={field.value as string | undefined}
                    onBlur={field.onBlur}
                    options={taxOptions}
                    onChange={(taxId) => {
                      field.onChange(taxId);
                      onTaxChange(taxId);
                    }}
                  />
                )}
              />
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm text-gray-500">{t(`${i18nPrefix}.field.tax`)}</span>
              {renderMoney(total.tax_amount)}
            </div>
          </>
        )}
        <div className="flex items-center justify-between gap-4 border-t border-gray-100 pt-3">
          <span className="text-sm font-medium text-gray-700">{t(`${i18nPrefix}.field.total`)}</span>
          {renderMoney(total.total_amount, 'text-lg font-semibold text-gray-900')}
        </div>
      </div>
    </Card>
  );
};
