import type { StockFormData } from '@/hooks/useStockManagement';
import { useI18n } from '@/hooks/useI18n';
import { Alert, Button, InputNumber, Select } from 'antd';
import { AlertTriangle, Plus, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';
import {
  Controller,
  type Control,
  type FieldError,
  type FieldErrors,
  type FieldArrayWithId,
  type UseFieldArrayAppend,
  type UseFieldArrayRemove,
} from 'react-hook-form';
import StockProductFieldContainer from './StockProductFieldContainer';

type StockProductUnitConversionTabProps = {
  control: Control<StockFormData>;
  errors: FieldErrors<StockFormData>;
  conversionWarning: { title: ReactNode; description: ReactNode } | null;
  unitMappingFields: FieldArrayWithId<StockFormData, 'unit_mappings', 'id'>[];
  appendUnitMapping: UseFieldArrayAppend<StockFormData, 'unit_mappings'>;
  removeUnitMapping: UseFieldArrayRemove;
  purchaseUnit: string;
  nextUnitMappingTarget: string;
  unitMappingOptions: Array<{ value: string; label: string }>;
  productUnits: string[];
  productUnitOptions: Array<{ value: string; label: string }>;
};

export default function StockProductUnitConversionTab({
  control,
  errors,
  conversionWarning,
  unitMappingFields,
  appendUnitMapping,
  removeUnitMapping,
  purchaseUnit,
  nextUnitMappingTarget,
  unitMappingOptions,
  productUnits,
  productUnitOptions,
}: StockProductUnitConversionTabProps) {
  const { t } = useI18n();

  return (
    <div className="space-y-4">
      <Alert
        type="info"
        showIcon
        title={t('stock.form.unitUsesGlobalManagement')}
        description={t('stock.form.unitUsesGlobalManagementDescription')}
      />

      {conversionWarning ? (
        <Alert
          title={conversionWarning.title}
          description={conversionWarning.description}
          type="warning"
          showIcon
          icon={<AlertTriangle size={20} />}
        />
      ) : null}

      <div>
        <div className="mb-2 flex items-center justify-between gap-3">
          <div>
            <h3 className="font-medium text-gray-700">{t('stock.form.productUnitConversion')}</h3>
            <p className="text-xs text-gray-500">{t('stock.form.productUnitConversionFormat')}</p>
          </div>
          <Button
            type="dashed"
            onClick={() => appendUnitMapping({
              from_quantity: 1,
              from_unit: purchaseUnit,
              to_quantity: 0,
              to_unit: nextUnitMappingTarget,
            })}
            icon={<Plus size={16} />}
            className="flex items-center gap-1"
          >
            {t('stock.form.addUnit')}
          </Button>
        </div>

        <div className="space-y-3">
          {unitMappingFields.map((field, index) => (
            <div
              key={field.id}
              className="flex items-start gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3"
            >
              <div className="grid flex-1 grid-cols-12 gap-2">
                <div className="col-span-2">
                  <StockProductFieldContainer
                    label={t('stock.form.qty')}
                    error={errors.unit_mappings?.[index]?.from_quantity as FieldError | undefined}
                  >
                    <Controller
                      name={`unit_mappings.${index}.from_quantity`}
                      control={control}
                      render={({ field: itemField }) => (
                        <InputNumber
                          {...itemField}
                          data-testid={`stock-product-unit-mapping-quantity-${index}`}
                          disabled
                          controls={false}
                          className="w-full"
                        />
                      )}
                    />
                  </StockProductFieldContainer>
                </div>

                <div className="col-span-3">
                  <StockProductFieldContainer
                    label={t('stock.form.unit')}
                    error={errors.unit_mappings?.[index]?.from_unit as FieldError | undefined}
                    required
                    requiredLabel={t('stock.form.requiredLabel')}
                  >
                    <Controller
                      name={`unit_mappings.${index}.from_unit`}
                      control={control}
                      render={({ field: itemField }) => (
                        <Select
                          data-testid={`stock-product-unit-mapping-source-unit-${index}`}
                          value={itemField.value}
                          onChange={itemField.onChange}
                          showSearch={{ optionFilterProp: 'label' }}
                          className="w-full"
                          placeholder={t('stock.form.unitPlaceholder')}
                          options={unitMappingOptions}
                        />
                      )}
                    />
                  </StockProductFieldContainer>
                </div>

                <div className="col-span-3">
                  <StockProductFieldContainer
                    label={t('stock.form.value')}
                    error={errors.unit_mappings?.[index]?.to_quantity as FieldError | undefined}
                    required
                    requiredLabel={t('stock.form.requiredLabel')}
                  >
                    <Controller
                      name={`unit_mappings.${index}.to_quantity`}
                      control={control}
                      render={({ field: itemField }) => (
                        <InputNumber
                          data-testid={`stock-product-unit-mapping-value-${index}`}
                          inputMode="decimal"
                          value={itemField.value}
                          onBlur={itemField.onBlur}
                          onChange={(value) => itemField.onChange(value ?? 0)}
                          className="w-full"
                          min={0.000001}
                          step={1}
                        />
                      )}
                    />
                  </StockProductFieldContainer>
                </div>

                <div className="col-span-4">
                  <StockProductFieldContainer
                    label={t('stock.form.unit')}
                    error={errors.unit_mappings?.[index]?.to_unit as FieldError | undefined}
                    required
                    requiredLabel={t('stock.form.requiredLabel')}
                  >
                    <Controller
                      name={`unit_mappings.${index}.to_unit`}
                      control={control}
                      render={({ field: itemField }) => (
                        <Select
                          data-testid={`stock-product-unit-mapping-target-unit-${index}`}
                          value={itemField.value}
                          onChange={itemField.onChange}
                          showSearch={{ optionFilterProp: 'label' }}
                          className="w-full"
                          placeholder={t('stock.form.unitPlaceholder')}
                          options={unitMappingOptions}
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
                onClick={() => removeUnitMapping(index)}
                className="mt-8"
              />
            </div>
          ))}
          {unitMappingFields.length === 0 ? (
            <p className="text-sm italic text-gray-500">{t('stock.form.noProductConversions')}</p>
          ) : null}
        </div>

        {errors.sellable_units?.message ? (
          <p className="mt-2 text-xs text-red-600">
            {String((errors.sellable_units as FieldError).message)}
          </p>
        ) : null}
      </div>

      {/*
        Selama produk cuma punya satuan utama, satuan default
        transaksi tidak punya pilihan lain selain satuan utama itu
        sendiri — jadi menampilkannya hanya menggandakan kolom di
        tab Produk. Pilihannya baru muncul setelah ada baris
        konversi, dan ditaruh di bawah daftar karena default cuma
        bisa dipilih dari satuan yang sudah didefinisikan.
      */}
      {productUnits.length > 1 ? (
        <StockProductFieldContainer
          label={t('stock.form.defaultUnit')}
          error={errors.selling_unit as FieldError | undefined}
          help={t('stock.form.defaultUnitHelp')}
          required
          requiredLabel={t('stock.form.requiredLabel')}
        >
          <Controller
            name="selling_unit"
            control={control}
            render={({ field }) => (
              <Select
                data-testid="stock-product-default-unit"
                value={field.value || undefined}
                onChange={field.onChange}
                showSearch={{ optionFilterProp: 'label' }}
                className="w-full"
                placeholder={t('stock.form.defaultUnitPlaceholder')}
                options={productUnitOptions}
              />
            )}
          />
        </StockProductFieldContainer>
      ) : null}
    </div>
  );
}
