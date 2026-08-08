import type { StockFormData } from '@/hooks/useStockManagement';
import { useI18n } from '@/hooks/useI18n';
import { getProductCategoryOptions } from '@/i18n/stock';
import { formatCurrencyInput, parseCurrencyInput } from '@/utils/formatters';
import { Button, Input, InputNumber, Select, Switch } from 'antd';
import type { InputRef } from 'antd';
import { ScanLine } from 'lucide-react';
import { useMemo, type RefObject } from 'react';
import { Controller, type Control, type FieldErrors } from 'react-hook-form';
import StockProductFieldContainer from './StockProductFieldContainer';

type StockProductGeneralTabProps = {
  control: Control<StockFormData>;
  errors: FieldErrors<StockFormData>;
  purchaseUnit: string;
  baseUnitOptions: Array<{ value: string; label: string }>;
  skuInputRef: RefObject<InputRef | null>;
  onOpenScanner: () => void;
  /** Cuma dipakai POS quick-create, yang butuh stok fisik langsung tersedia untuk dijual. */
  showPurchaseQuantity?: boolean;
};

export default function StockProductGeneralTab({
  control,
  errors,
  purchaseUnit,
  baseUnitOptions,
  skuInputRef,
  onOpenScanner,
  showPurchaseQuantity = false,
}: StockProductGeneralTabProps) {
  const { t } = useI18n();
  const categoryOptions = useMemo(() => getProductCategoryOptions(t), [t]);

  return (
    <>
      <div className="grid grid-cols-1 gap-x-4">
        <StockProductFieldContainer
          label={t('stock.form.name')}
          error={errors.name}
          required
          requiredLabel={t('stock.form.requiredLabel')}
        >
          <Controller
            name="name"
            control={control}
            render={({ field }) => (
              <Input {...field} data-testid="stock-product-name" className="w-full" />
            )}
          />
        </StockProductFieldContainer>

        <StockProductFieldContainer
          label="SKU"
          error={errors.sku}
          help={t('stock.form.hardwareScannerHint')}
        >
          <div className="flex gap-2">
            <Controller
              name="sku"
              control={control}
              render={({ field }) => (
                <Input
                  {...field}
                  ref={skuInputRef}
                  data-testid="stock-product-sku"
                  className="flex-1"
                />
              )}
            />
            <Button type="default" icon={<ScanLine size={16} />} onClick={onOpenScanner} />
          </div>
        </StockProductFieldContainer>

        <StockProductFieldContainer
          label={t('stock.category')}
          error={errors.category}
          required
          requiredLabel={t('stock.form.requiredLabel')}
        >
          <Controller
            name="category"
            control={control}
            render={({ field }) => (
              <Select {...field} className="w-full" options={categoryOptions} />
            )}
          />
        </StockProductFieldContainer>

        <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
          <StockProductFieldContainer label="Tipe Produk" error={errors.product_type}>
            <Controller
              name="product_type"
              control={control}
              render={({ field }) => (
                <Select {...field} className="w-full" options={[
                  { value: 'FINISHED_GOOD', label: 'Barang Jadi' },
                  { value: 'RAW_MATERIAL', label: 'Bahan Baku' },
                ]} />
              )}
            />
          </StockProductFieldContainer>
          <StockProductFieldContainer
            label="Tampil di POS"
            error={errors.is_visible_in_pos}
            help="Jika dinonaktifkan, produk tetap tersimpan tetapi tidak muncul di katalog POS."
          >
            <Controller
              name="is_visible_in_pos"
              control={control}
              render={({ field }) => <Switch checked={field.value} onChange={field.onChange} />}
            />
          </StockProductFieldContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
        <StockProductFieldContainer
          label={t('stock.form.baseStockUnit')}
          error={errors.purchase_unit}
          help={t('stock.form.baseStockUnitHelp')}
          required
          requiredLabel={t('stock.form.requiredLabel')}
        >
          <Controller
            name="purchase_unit"
            control={control}
            render={({ field }) => (
              <Select
                {...field}
                data-testid="stock-product-base-unit"
                showSearch={{ optionFilterProp: 'label' }}
                className="w-full"
                options={baseUnitOptions}
              />
            )}
          />
        </StockProductFieldContainer>
        <StockProductFieldContainer
          label={t('stock.form.purchasePricePer', { unit: purchaseUnit })}
          error={errors.purchase_price}
          help={t('stock.form.priceOptionalHelp')}
        >
          <Controller
            name="purchase_price"
            control={control}
            render={({ field }) => (
              <InputNumber
                data-testid="stock-product-purchase-price"
                inputMode="decimal"
                value={field.value}
                onBlur={field.onBlur}
                onChange={(value) => field.onChange(value ?? undefined)}
                className="w-full"
                placeholder={t('stock.form.purchasePricePlaceholder', { unit: purchaseUnit })}
                prefix="Rp"
                formatter={formatCurrencyInput}
                parser={parseCurrencyInput}
                step={0.01}
                min={0}
              />
            )}
          />
        </StockProductFieldContainer>

        <StockProductFieldContainer
          label={t('stock.form.sellingPricePer', { unit: purchaseUnit })}
          error={errors.selling_price}
          help={t('stock.form.priceOptionalHelp')}
        >
          <Controller
            name="selling_price"
            control={control}
            render={({ field }) => (
              <InputNumber
                data-testid="stock-product-selling-price"
                inputMode="decimal"
                value={field.value}
                onBlur={field.onBlur}
                onChange={(value) => field.onChange(value ?? undefined)}
                className="w-full"
                placeholder={t('stock.form.sellingPricePlaceholder', { unit: purchaseUnit })}
                prefix="Rp"
                formatter={formatCurrencyInput}
                parser={parseCurrencyInput}
                step={0.01}
                min={0}
              />
            )}
          />
        </StockProductFieldContainer>

        {showPurchaseQuantity && (
          <StockProductFieldContainer
            label={t('stock.form.purchaseQuantity')}
            error={errors.purchase_quantity}
            help={t('stock.form.priceOptionalHelp')}
          >
            <Controller
              name="purchase_quantity"
              control={control}
              render={({ field }) => (
                <InputNumber
                  data-testid="stock-product-purchase-quantity"
                  inputMode="decimal"
                  value={field.value}
                  onBlur={field.onBlur}
                  onChange={(value) => field.onChange(value ?? undefined)}
                  className="w-full"
                  placeholder={t('stock.form.purchaseQuantityPlaceholder')}
                  min={0}
                />
              )}
            />
          </StockProductFieldContainer>
        )}
      </div>
    </>
  );
}
