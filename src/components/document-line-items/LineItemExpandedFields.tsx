import { InputNumber, Select } from 'antd';
import { useI18n } from '@/hooks/useI18n';
import { useIsMobile } from '@/hooks/useIsMobile';
import type { PromoType, SalesDocumentItem } from '@/types';
import {
  formatBaseCurrencyAmount,
  type DocumentCurrencySnapshot,
} from '@/utils/documentCurrency';

interface Option {
  value: string;
  label: string;
}

// Field pajak/diskon di SalesDocumentItem dan PurchaseDocumentItem identik secara
// struktural, jadi Pick dari salah satunya berlaku untuk keduanya.
export type LineItemTaxDiscountFields = Pick<SalesDocumentItem,
  'id' | 'discount_type' | 'discount_value' | 'discount_amount' | 'tax_id' | 'tax_amount'
>;

export type LineItemTaxDiscountPatch = Partial<Pick<SalesDocumentItem,
  'discount_type' | 'discount_value' | 'tax_id' | 'tax_name' | 'tax_code' | 'tax_rate' |
  'tax_calculation_mode' | 'tax_flow' | 'tax_account_id' | 'tax_account_code' |
  'tax_account_name' | 'tax_account_type'
>>;

interface LineItemExpandedFieldsProps {
  i18nPrefix: 'salesDocuments' | 'purchaseDocuments';
  item: LineItemTaxDiscountFields;
  calculatedItem?: { tax_amount?: number };
  taxOptions: Option[];
  documentCurrencySnapshot: DocumentCurrencySnapshot;
  onUpdateItem: (itemId: string, patch: LineItemTaxDiscountPatch) => void;
}

const expandedFieldControlClassNameDesktop = [
  'h-9 w-full',
  '[&_.ant-input-number-input]:h-9',
  '[&_.ant-input-number-input]:py-0',
  '[&_.ant-select-selector]:!h-9',
  '[&_.ant-select-selection-item]:!leading-9',
  '[&_.ant-select-selection-placeholder]:!leading-9',
].join(' ');

const expandedFieldControlClassNameMobile = [
  'h-11 w-full',
  '[&_.ant-input-number-input]:h-11',
  '[&_.ant-input-number-input]:py-0',
  '[&_.ant-select-selector]:!h-11',
  '[&_.ant-select-selection-item]:!leading-[2.75rem]',
  '[&_.ant-select-selection-placeholder]:!leading-[2.75rem]',
].join(' ');

const buildExpandedFieldControlClassName = (isMobile: boolean) => (
  isMobile ? expandedFieldControlClassNameMobile : expandedFieldControlClassNameDesktop
);

const expandedFieldLabelClassName = 'mb-1 flex min-h-5 items-center text-xs text-gray-500';

export const LineItemExpandedFields = ({
  i18nPrefix,
  item,
  calculatedItem,
  taxOptions,
  documentCurrencySnapshot,
  onUpdateItem,
}: LineItemExpandedFieldsProps) => {
  const { t } = useI18n();
  const isMobile = useIsMobile();
  const displayedItem = calculatedItem ?? item;
  const expandedFieldControlClassName = buildExpandedFieldControlClassName(isMobile);

  return (
    <div className="border-t border-gray-100 bg-gray-50/70 px-3 py-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <div className={expandedFieldLabelClassName}>{t(`${i18nPrefix}.field.discount`)}</div>
          <div className="grid grid-cols-[120px_1fr] gap-2">
            <Select
              className={expandedFieldControlClassName}
              value={item.discount_type ?? 'fixed'}
              options={[
                { value: 'percent' satisfies PromoType, label: t(`${i18nPrefix}.discountType.percent`) },
                { value: 'fixed' satisfies PromoType, label: t(`${i18nPrefix}.discountType.fixed`) },
              ]}
              onChange={(discountType: PromoType) => onUpdateItem(item.id, { discount_type: discountType })}
            />
            <InputNumber
              min={0}
              className={expandedFieldControlClassName}
              value={item.discount_value ?? item.discount_amount}
              onChange={(value) => onUpdateItem(item.id, { discount_value: Number(value || 0) })}
            />
          </div>
        </div>
        <div>
          <div className={expandedFieldLabelClassName}>{t(`${i18nPrefix}.field.tax`)} (%)</div>
          <Select
            allowClear
            className={expandedFieldControlClassName}
            placeholder={t(`${i18nPrefix}.placeholder.itemTax`)}
            value={item.tax_id || undefined}
            options={taxOptions}
            onChange={(taxId?: string) => onUpdateItem(item.id, {
              tax_id: taxId,
              tax_name: undefined,
              tax_code: undefined,
              tax_rate: undefined,
              tax_calculation_mode: undefined,
              tax_flow: undefined,
              tax_account_id: undefined,
              tax_account_code: undefined,
              tax_account_name: undefined,
              tax_account_type: undefined,
            })}
          />
        </div>
        <div>
          <div className={expandedFieldLabelClassName}>{t(`${i18nPrefix}.field.tax`)}</div>
          <InputNumber
            className={expandedFieldControlClassName}
            value={displayedItem.tax_amount}
            formatter={(value) => formatBaseCurrencyAmount(Number(value || 0), documentCurrencySnapshot)}
            disabled
          />
        </div>
      </div>
    </div>
  );
};
