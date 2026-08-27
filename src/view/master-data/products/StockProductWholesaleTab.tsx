import type { StockFormData } from '@/hooks/useStockManagement';
import { useI18n } from '@/hooks/useI18n';
import { formatCurrencyInput, parseCurrencyInput } from '@/utils/formatters';
import { Button, InputNumber, Select } from 'antd';
import { Plus, Trash2 } from 'lucide-react';
import {
  Controller,
  type Control,
  type FieldErrors,
  type FieldArrayWithId,
  type UseFieldArrayAppend,
  type UseFieldArrayRemove,
} from 'react-hook-form';
import StockProductFieldContainer from './StockProductFieldContainer';

type StockProductWholesaleTabProps = {
  control: Control<StockFormData>;
  errors: FieldErrors<StockFormData>;
  wholesaleFields: FieldArrayWithId<StockFormData, 'wholesale_prices', 'id'>[];
  appendWholesale: UseFieldArrayAppend<StockFormData, 'wholesale_prices'>;
  removeWholesale: UseFieldArrayRemove;
  purchaseUnit: string;
  productUnitOptions: Array<{ value: string; label: string }>;
  wholesalePrices: StockFormData['wholesale_prices'];
};

export default function StockProductWholesaleTab({
  control,
  errors,
  wholesaleFields,
  appendWholesale,
  removeWholesale,
  purchaseUnit,
  productUnitOptions,
  wholesalePrices,
}: StockProductWholesaleTabProps) {
  const { t } = useI18n();

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-medium text-gray-700">{t('stock.form.wholesaleTitle')}</h3>
        <Button
          type="dashed"
          onClick={() => appendWholesale({
            min_quantity: 2,
            unit: purchaseUnit,
            price: 0,
            price_type: 'unit',
          })}
          icon={<Plus size={16} />}
          className="flex items-center gap-1"
        >
          {t('stock.form.addPrice')}
        </Button>
      </div>

      <div className="space-y-3">
        {wholesaleFields.map((field, index) => (
          <div
            key={field.id}
            className="flex items-start gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3"
          >
            <div className="grid flex-1 grid-cols-12 gap-2">
              <div className="col-span-3">
                <StockProductFieldContainer
                  label={t('stock.form.minQty')}
                  error={errors.wholesale_prices?.[index]?.min_quantity}
                  required
                  requiredLabel={t('stock.form.requiredLabel')}
                >
                  <Controller
                    name={`wholesale_prices.${index}.min_quantity`}
                    control={control}
                    render={({ field: itemField }) => (
                      <InputNumber
                        data-testid={`stock-product-wholesale-min-quantity-${index}`}
                        inputMode="decimal"
                        value={itemField.value}
                        onBlur={itemField.onBlur}
                        onChange={(value) => itemField.onChange(value ?? 1)}
                        className="w-full"
                        placeholder={t('stock.form.qtyPlaceholder')}
                        min={1}
                      />
                    )}
                  />
                </StockProductFieldContainer>
              </div>

              <div className="col-span-3">
                <StockProductFieldContainer
                  label={t('stock.form.unit')}
                  error={errors.wholesale_prices?.[index]?.unit}
                  required
                  requiredLabel={t('stock.form.requiredLabel')}
                >
                  <Controller
                    name={`wholesale_prices.${index}.unit`}
                    control={control}
                    render={({ field: itemField }) => (
                      <Select
                        data-testid={`stock-product-wholesale-unit-${index}`}
                        value={itemField.value}
                        onChange={itemField.onChange}
                        className="w-full"
                        placeholder={t('stock.form.unitPlaceholder')}
                        options={productUnitOptions}
                      />
                    )}
                  />
                </StockProductFieldContainer>
              </div>

              <div className="col-span-3">
                <StockProductFieldContainer label={t('stock.form.type')}>
                  <Controller
                    name={`wholesale_prices.${index}.price_type`}
                    control={control}
                    render={({ field: itemField }) => (
                      <Select
                        value={itemField.value}
                        onChange={itemField.onChange}
                        className="w-full"
                        options={[
                          {
                            value: 'unit',
                            label: t('stock.form.perUnit', {
                              unit: wholesalePrices[index]?.unit || purchaseUnit,
                            }),
                          },
                          { value: 'bundle', label: t('stock.form.bundle') },
                        ]}
                      />
                    )}
                  />
                </StockProductFieldContainer>
              </div>

              <div className="col-span-3">
                <StockProductFieldContainer
                  label={t('stock.form.price')}
                  error={errors.wholesale_prices?.[index]?.price}
                  required
                  requiredLabel={t('stock.form.requiredLabel')}
                >
                  <Controller
                    name={`wholesale_prices.${index}.price`}
                    control={control}
                    render={({ field: itemField }) => (
                      <InputNumber
                        data-testid={`stock-product-wholesale-price-${index}`}
                        inputMode="decimal"
                        value={itemField.value}
                        onBlur={itemField.onBlur}
                        onChange={(value) => itemField.onChange(value ?? 0)}
                        className="w-full"
                        placeholder={t('stock.form.nominalPlaceholder')}
                        prefix="Rp"
                        min={0}
                        formatter={formatCurrencyInput}
                        parser={parseCurrencyInput}
                      />
                    )}
                  />
                </StockProductFieldContainer>
              </div>
            </div>

            <Button
              danger
              type="text"
              icon={<Trash2 size={16} />}
              onClick={() => removeWholesale(index)}
              className="mt-8"
            />
          </div>
        ))}
        {wholesaleFields.length === 0 ? (
          <p className="text-sm italic text-gray-500">{t('stock.form.noWholesalePrices')}</p>
        ) : null}
      </div>
    </div>
  );
}
