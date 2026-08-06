import { zodResolver } from '@hookform/resolvers/zod';
import { App, Button, Form, InputNumber, Modal, Tag } from 'antd';
import { useEffect, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useI18n } from '@/hooks/useI18n';
import { buildQuickCreateDefaultValues, useProductQuickCreateForm } from '@/hooks/useProductQuickCreateForm';
import type { StockFormData } from '@/lib/validations/stock';
import {
  posQuickItemTopUpSchema,
  type PosQuickItemTopUpFormData,
  type PosQuickItemTopUpFormValues,
} from '@/lib/validations/posQuickItem';
import {
  createPosQuickItem,
  findPosQuickItemCandidates,
  linkBarcodeToExistingProduct,
  receiveQuickStockForProduct,
  resolveQuickItemEstimatedCost,
  type PosQuickItemCandidate,
} from '@/services/posQuickItemService';
import type { Product, ProductCategory } from '@/types';
import { formatCurrency, formatCurrencyInput, parseCurrencyInput } from '@/utils/formatters';
import StockProductModal from '@/view/master-data/products/StockProductModal';

const CANDIDATE_LOOKUP_DELAY = 250;

const currencyInputProps = {
  className: 'w-full',
  min: 0,
  formatter: formatCurrencyInput,
  parser: parseCurrencyInput,
} as const;

interface PosQuickItemModalProps {
  open: boolean;
  initialBarcode?: string;
  initialName?: string;
  /** Bila diisi, modal hanya menambah stok untuk produk tersebut. */
  topUpProduct?: Product | null;
  onCancel: () => void;
  onResolved: (product: Product) => void;
}

const QuickItemTopUpForm = ({
  open,
  product,
  onResolved,
}: { open: boolean; product: Product; onResolved: (product: Product) => void }) => {
  const { t } = useI18n();
  const { message } = App.useApp();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<PosQuickItemTopUpFormValues, unknown, PosQuickItemTopUpFormData>({
    resolver: zodResolver(posQuickItemTopUpSchema),
    defaultValues: { quantity: 1, estimated_purchase_price: undefined },
  });

  useEffect(() => {
    if (!open) return;
    reset({ quantity: 1, estimated_purchase_price: undefined });
  }, [open, reset]);

  const handleFormSubmit = async (values: PosQuickItemTopUpFormData) => {
    setIsSubmitting(true);
    try {
      const result = await receiveQuickStockForProduct({
        productId: product.id,
        quantity: values.quantity,
        estimatedPurchasePrice: values.estimated_purchase_price,
      });

      message.success(t('transaction.quickItem.stockReceived', {
        name: result.product.name,
        document: result.documentNumber,
      }));
      onResolved(result.product);
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('transaction.quickItem.failed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Form layout="vertical" component={false}>
      <form onSubmit={handleSubmit(handleFormSubmit)} className="flex flex-col gap-1">
        <div className="mb-2 text-sm text-gray-600">
          {t('transaction.quickItem.topUpIntro', { name: product.name })}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Form.Item
            label={t('transaction.quickItem.quantity')}
            required
            validateStatus={errors.quantity ? 'error' : undefined}
            help={errors.quantity?.message}
          >
            <Controller
              control={control}
              name="quantity"
              render={({ field }) => <InputNumber {...field} className="w-full" min={0} autoFocus />}
            />
          </Form.Item>

          <Form.Item
            label={`${t('transaction.quickItem.estimatedCost')} (${t('transaction.quickItem.estimatedCostOptional')})`}
            validateStatus={errors.estimated_purchase_price ? 'error' : undefined}
            help={errors.estimated_purchase_price?.message}
          >
            <Controller
              control={control}
              name="estimated_purchase_price"
              render={({ field }) => <InputNumber {...field} {...currencyInputProps} />}
            />
          </Form.Item>
        </div>

        <div className="mb-3 rounded bg-gray-50 p-2 text-xs text-gray-600">
          {t('transaction.quickItem.quantityHint')}
        </div>

        <Button type="primary" block htmlType="submit" loading={isSubmitting}>
          {t('transaction.quickItem.topUpSubmit')}
        </Button>
      </form>
    </Form>
  );
};

const QuickItemCreateForm = ({
  open,
  initialBarcode,
  initialName,
  onCancel,
  onResolved,
}: {
  open: boolean;
  initialBarcode: string;
  initialName: string;
  onCancel: () => void;
  onResolved: (product: Product) => void;
}) => {
  const { t } = useI18n();
  const { message } = App.useApp();
  const [candidates, setCandidates] = useState<PosQuickItemCandidate[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const quickCreateForm = useProductQuickCreateForm();
  const { control, getValues } = quickCreateForm;

  const watchedName = useWatch({ control, name: 'name' }) ?? '';
  const watchedSellingPrice = useWatch({ control, name: 'selling_price' });
  const watchedPurchasePrice = useWatch({ control, name: 'purchase_price' });

  useEffect(() => {
    if (!open) return;

    quickCreateForm.reset(buildQuickCreateDefaultValues({
      name: initialName,
      sku: initialBarcode,
      purchase_unit: 'pcs',
      selling_unit: 'pcs',
      sellable_units: ['pcs'],
      purchase_quantity: 1,
    }));
    setCandidates([]);
    // quickCreateForm.reset is a stable react-hook-form reference.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialName, initialBarcode]);

  useEffect(() => {
    if (!open) return undefined;

    let active = true;
    const timer = window.setTimeout(async () => {
      const found = await findPosQuickItemCandidates(watchedName);
      if (active) setCandidates(found);
    }, CANDIDATE_LOOKUP_DELAY);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [open, watchedName]);

  const estimatePreview = resolveQuickItemEstimatedCost(Number(watchedSellingPrice || 0), Number(watchedPurchasePrice || 0));

  const handleUseCandidate = async (candidate: PosQuickItemCandidate) => {
    const values = getValues();
    const barcode = (values.sku || '').trim();
    setIsSubmitting(true);
    try {
      let product = candidate.product;

      if (barcode && !candidate.hasBarcode) {
        product = await linkBarcodeToExistingProduct(product.id, barcode);
        message.success(t('transaction.quickItem.barcodeLinked', { name: product.name }));
      }

      // Produk lama yang stok sistemnya habis tetap perlu penerimaan barang dulu,
      // kalau tidak keranjang akan menolaknya.
      if (product.stock <= 0) {
        const result = await receiveQuickStockForProduct({
          productId: product.id,
          quantity: Number(values.purchase_quantity || 0),
          estimatedPurchasePrice: Number(values.purchase_price || 0),
        });
        product = result.product;
        message.success(t('transaction.quickItem.stockReceived', {
          name: product.name,
          document: result.documentNumber,
        }));
      }

      onResolved(product);
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('transaction.quickItem.failed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreatePersist = async (data: StockFormData): Promise<Product> => {
    const result = await createPosQuickItem({
      name: data.name,
      barcode: data.sku,
      sellingPrice: Number(data.selling_price || 0),
      quantity: Number(data.purchase_quantity || 0),
      purchaseUnit: data.purchase_unit,
      sellingUnit: data.selling_unit,
      sellableUnits: data.sellable_units,
      unitMappings: data.unit_mappings,
      wholesalePrices: data.wholesale_prices,
      category: data.category as ProductCategory | undefined,
      productType: data.product_type,
      estimatedPurchasePrice: data.purchase_price,
    });

    message.success(t(
      result.isEstimateGuessed ? 'transaction.quickItem.createdEstimated' : 'transaction.quickItem.created',
      { name: result.product.name, document: result.documentNumber },
    ));

    return result.product;
  };

  const handleSave = async () => {
    setIsSubmitting(true);
    try {
      const product = await quickCreateForm.submit(handleCreatePersist);
      if (product) {
        onResolved(product);
      }
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('transaction.quickItem.failed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const topContent = (
    <div className="mb-4 flex flex-col gap-3">
      <div className="text-sm text-gray-600">{t('transaction.quickItem.intro')}</div>

      {candidates.length > 0 && (
        <div className="rounded border border-amber-200 bg-amber-50 p-2">
          <div className="mb-1 text-xs font-semibold text-amber-900">
            {t('transaction.quickItem.candidateTitle')}
          </div>
          <div className="flex flex-col gap-1">
            {candidates.map((candidate) => (
              <div key={candidate.product.id} className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm text-gray-900">{candidate.product.name}</div>
                  <div className="flex flex-wrap gap-1">
                    {candidate.isHiddenFromPos && (
                      <Tag color="orange">{t('transaction.quickItem.candidateHidden')}</Tag>
                    )}
                    {!candidate.hasBarcode && (
                      <Tag>{t('transaction.quickItem.candidateNoBarcode')}</Tag>
                    )}
                    {candidate.product.stock <= 0 && (
                      <Tag color="red">{t('transaction.quickItem.candidateNoStock')}</Tag>
                    )}
                  </div>
                </div>
                <Button
                  size="small"
                  disabled={isSubmitting || candidate.isHiddenFromPos}
                  title={candidate.isHiddenFromPos ? t('transaction.quickItem.candidateHiddenHint') : undefined}
                  onClick={() => void handleUseCandidate(candidate)}
                >
                  {t('transaction.quickItem.useCandidate')}
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="rounded bg-gray-50 p-2 text-xs text-gray-600">
        {t('transaction.quickItem.quantityHint')}
        {estimatePreview.isGuessed && Number(watchedSellingPrice || 0) > 0 && (
          <div className="mt-1">
            {t('transaction.quickItem.estimatedCostHint', {
              price: formatCurrency(estimatePreview.price),
            })}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <StockProductModal
      open={open}
      editingId={null}
      control={quickCreateForm.control}
      errors={quickCreateForm.formState.errors}
      setValue={quickCreateForm.setValue}
      getValues={quickCreateForm.getValues}
      reset={quickCreateForm.reset}
      setIsModalOpen={() => {}}
      title={t('transaction.quickItem.title')}
      submitLabel={t('transaction.quickItem.submit')}
      topContent={topContent}
      onCancel={onCancel}
      onSave={handleSave}
    />
  );
};

export const PosQuickItemModal = ({
  open,
  initialBarcode = '',
  initialName = '',
  topUpProduct = null,
  onCancel,
  onResolved,
}: PosQuickItemModalProps) => {
  const { t } = useI18n();

  if (topUpProduct) {
    return (
      <Modal
        title={t('transaction.quickItem.topUpTitle')}
        open={open}
        onCancel={onCancel}
        footer={null}
        destroyOnClose
      >
        <QuickItemTopUpForm open={open} product={topUpProduct} onResolved={onResolved} />
      </Modal>
    );
  }

  return (
    <QuickItemCreateForm
      open={open}
      initialBarcode={initialBarcode}
      initialName={initialName}
      onCancel={onCancel}
      onResolved={onResolved}
    />
  );
};
