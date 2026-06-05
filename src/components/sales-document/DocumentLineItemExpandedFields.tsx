import { Button, InputNumber, Select } from 'antd';
import { useI18n } from '@/hooks/useI18n';
import type { PromoType, SalesDocumentItem } from '@/types';
import { BASE_CURRENCY_CODE } from '@/constants/currencies';
import {
  normalizeCurrencyCode,
  normalizeExchangeRate,
  toForeignAmount,
  type DocumentCurrencySnapshot,
} from '@/utils/documentCurrency';
import { formatCurrency } from '@/utils/formatters';

interface Option {
  value: string;
  label: string;
}

interface DocumentLineItemExpandedFieldsProps {
  item: SalesDocumentItem;
  calculatedItem?: SalesDocumentItem;
  taxOptions: Option[];
  currencyOptions: Option[];
  documentCurrencySnapshot: DocumentCurrencySnapshot;
  onUpdateItem: (itemId: string, patch: Partial<SalesDocumentItem>) => void;
}

const expandedFieldControlClassName = [
  'h-9 w-full',
  '[&_.ant-input-number-input]:h-9',
  '[&_.ant-input-number-input]:py-0',
  '[&_.ant-select-selector]:!h-9',
  '[&_.ant-select-selection-item]:!leading-9',
  '[&_.ant-select-selection-placeholder]:!leading-9',
].join(' ');

const expandedFieldLabelClassName = 'mb-1 flex min-h-5 items-center text-xs text-gray-500';

export const DocumentLineItemExpandedFields = ({
  item,
  calculatedItem,
  taxOptions,
  currencyOptions,
  documentCurrencySnapshot,
  onUpdateItem,
}: DocumentLineItemExpandedFieldsProps) => {
  const { t } = useI18n();
  const displayedItem = calculatedItem ?? item;
  const isPriceEdited = Boolean(item.is_price_edited && item.original_price !== undefined);
  const itemCurrencyCode = normalizeCurrencyCode(item.currency_code ?? documentCurrencySnapshot.currency_code);
  const itemExchangeRate = normalizeExchangeRate(item.exchange_rate ?? documentCurrencySnapshot.exchange_rate);
  const isForeignCurrency = itemCurrencyCode !== BASE_CURRENCY_CODE;

  return (
    <div className="border-t border-gray-100 bg-gray-50/70 px-3 py-3">
      <div className="grid grid-cols-4 gap-3">
        <div>
          <div className={`${expandedFieldLabelClassName} justify-between gap-2`}>
            <span className="min-w-0 truncate">{t('salesDocuments.field.price')}</span>
            {isPriceEdited && (
              <Button
                type="link"
                size="small"
                className="h-auto shrink-0 whitespace-nowrap p-0 text-xs leading-none"
                onClick={() => onUpdateItem(item.id, { price: item.original_price })}
              >
                {t('salesDocuments.resetSystemPrice')}
              </Button>
            )}
          </div>
          <InputNumber
            min={0}
            className={expandedFieldControlClassName}
            value={item.price}
            onChange={(value) => onUpdateItem(item.id, { price: Number(value || 0) })}
          />
          {isPriceEdited && (
            <p className="mt-1 text-xs text-amber-700">
              {t('salesDocuments.systemPrice', { price: formatCurrency(item.original_price || 0) })}
            </p>
          )}
        </div>
        <div>
          <div className={expandedFieldLabelClassName}>{t('documents.currencyOverride')}</div>
          <Select
            className={expandedFieldControlClassName}
            value={itemCurrencyCode}
            options={currencyOptions}
            onChange={(currencyCode: string) => onUpdateItem(item.id, {
              currency_code: currencyCode,
              exchange_rate: currencyCode === BASE_CURRENCY_CODE ? 1 : itemExchangeRate,
              exchange_rate_source: currencyCode === BASE_CURRENCY_CODE ? 'SYSTEM' : 'MANUAL',
              exchange_rate_basis: 'MID',
              exchange_rate_date: item.exchange_rate_date ?? documentCurrencySnapshot.exchange_rate_date,
            })}
          />
        </div>
        <div>
          <div className={expandedFieldLabelClassName}>{t('documents.foreignPrice')}</div>
          <InputNumber
            min={0}
            className={expandedFieldControlClassName}
            disabled={!isForeignCurrency}
            value={isForeignCurrency ? item.foreign_price ?? toForeignAmount(item.price, itemExchangeRate) : item.price}
            onChange={(value) => onUpdateItem(item.id, {
              foreign_price: Number(value || 0),
              exchange_rate: itemExchangeRate,
              exchange_rate_source: 'MANUAL',
              exchange_rate_basis: 'MID',
            })}
          />
        </div>
        <div>
          <div className={expandedFieldLabelClassName}>{t('documents.exchangeRate')}</div>
          <InputNumber
            min={isForeignCurrency ? 0.000001 : 1}
            className={expandedFieldControlClassName}
            disabled={!isForeignCurrency}
            value={itemExchangeRate}
            formatter={(value) => formatCurrency(Number(value || 0))}
            onChange={(value) => onUpdateItem(item.id, {
              exchange_rate: Number(value || 1),
              exchange_rate_source: 'MANUAL',
              exchange_rate_basis: 'MID',
            })}
          />
        </div>
        <div>
          <div className={expandedFieldLabelClassName}>{t('salesDocuments.field.discount')}</div>
          <div className="grid grid-cols-[120px_1fr] gap-2">
            <Select
              className={expandedFieldControlClassName}
              value={item.discount_type ?? 'fixed'}
              options={[
                { value: 'percent' satisfies PromoType, label: t('salesDocuments.discountType.percent') },
                { value: 'fixed' satisfies PromoType, label: t('salesDocuments.discountType.fixed') },
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
          <div className={expandedFieldLabelClassName}>{t('salesDocuments.field.tax')} (%)</div>
          <Select
            allowClear
            className={expandedFieldControlClassName}
            placeholder={t('salesDocuments.placeholder.itemTax')}
            value={item.tax_id || undefined}
            options={taxOptions}
            onChange={(taxId?: string) => onUpdateItem(item.id, {
              tax_id: taxId,
              tax_name: undefined,
              tax_code: undefined,
              tax_rate: undefined,
              tax_calculation_mode: undefined,
            })}
          />
        </div>
        <div>
          <div className={expandedFieldLabelClassName}>{t('salesDocuments.field.tax')}</div>
          <InputNumber
            className={expandedFieldControlClassName}
            value={displayedItem.tax_amount}
            formatter={(value) => `Rp ${formatCurrency(Number(value || 0))}`}
            disabled
          />
        </div>
      </div>
    </div>
  );
};
