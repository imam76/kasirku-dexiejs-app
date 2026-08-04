import { zodResolver } from '@hookform/resolvers/zod';
import { App, Button, Form, Input, InputNumber, Modal, Select, Tag } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useI18n } from '@/hooks/useI18n';
import { useUnits } from '@/hooks/useUnits';
import {
  posQuickItemSchema,
  posQuickItemTopUpSchema,
  type PosQuickItemFormData,
  type PosQuickItemFormValues,
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
import type { Product } from '@/types';
import { formatCurrency, formatCurrencyInput, parseCurrencyInput } from '@/utils/formatters';

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

interface QuickItemFormProps {
  open: boolean;
  onResolved: (product: Product) => void;
}

const QuickItemTopUpForm = ({
  open,
  product,
  onResolved,
}: QuickItemFormProps & { product: Product }) => {
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
  onResolved,
}: QuickItemFormProps & { initialBarcode: string; initialName: string }) => {
  const { t } = useI18n();
  const { message } = App.useApp();
  const { unitOptions } = useUnits();
  const [candidates, setCandidates] = useState<PosQuickItemCandidate[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const {
    control,
    handleSubmit,
    getValues,
    reset,
    formState: { errors },
  } = useForm<PosQuickItemFormValues, unknown, PosQuickItemFormData>({
    resolver: zodResolver(posQuickItemSchema),
    defaultValues: {
      name: initialName,
      barcode: initialBarcode,
      selling_price: undefined as unknown as number,
      quantity: 1,
      unit: 'pcs',
      estimated_purchase_price: undefined,
    },
  });

  const watchedName = useWatch({ control, name: 'name' }) ?? '';
  const watchedSellingPrice = useWatch({ control, name: 'selling_price' });
  const watchedEstimatedCost = useWatch({ control, name: 'estimated_purchase_price' });

  useEffect(() => {
    if (!open) return;

    reset({
      name: initialName,
      barcode: initialBarcode,
      selling_price: undefined as unknown as number,
      quantity: 1,
      unit: 'pcs',
      estimated_purchase_price: undefined,
    });
    setCandidates([]);
  }, [initialBarcode, initialName, open, reset]);

  useEffect(() => {
    if (!open) return;

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

  const estimatePreview = useMemo(
    () => resolveQuickItemEstimatedCost(Number(watchedSellingPrice || 0), Number(watchedEstimatedCost || 0)),
    [watchedSellingPrice, watchedEstimatedCost],
  );

  const handleUseCandidate = async (candidate: PosQuickItemCandidate) => {
    const barcode = (getValues('barcode') || '').trim();
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
          quantity: Number(getValues('quantity') || 0),
          estimatedPurchasePrice: Number(getValues('estimated_purchase_price') || 0),
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

  const handleFormSubmit = async (values: PosQuickItemFormData) => {
    setIsSubmitting(true);
    try {
      const result = await createPosQuickItem({
        name: values.name,
        barcode: values.barcode,
        sellingPrice: values.selling_price,
        quantity: values.quantity,
        unit: values.unit,
        estimatedPurchasePrice: values.estimated_purchase_price,
      });

      message.success(t(
        result.isEstimateGuessed ? 'transaction.quickItem.createdEstimated' : 'transaction.quickItem.created',
        { name: result.product.name, document: result.documentNumber },
      ));
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
        <div className="mb-2 text-sm text-gray-600">{t('transaction.quickItem.intro')}</div>

        <Form.Item
          label={t('transaction.quickItem.name')}
          required
          validateStatus={errors.name ? 'error' : undefined}
          help={errors.name?.message}
        >
          <Controller
            control={control}
            name="name"
            render={({ field }) => (
              <Input {...field} placeholder={t('transaction.quickItem.namePlaceholder')} autoFocus />
            )}
          />
        </Form.Item>

        {candidates.length > 0 && (
          <div className="mb-3 rounded border border-amber-200 bg-amber-50 p-2">
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

        <Form.Item
          label={t('transaction.quickItem.barcode')}
          validateStatus={errors.barcode ? 'error' : undefined}
          help={errors.barcode?.message}
        >
          <Controller
            control={control}
            name="barcode"
            render={({ field }) => (
              <Input {...field} placeholder={t('transaction.quickItem.barcodePlaceholder')} />
            )}
          />
        </Form.Item>

        <div className="grid grid-cols-2 gap-2">
          <Form.Item
            label={t('transaction.quickItem.sellingPrice')}
            required
            validateStatus={errors.selling_price ? 'error' : undefined}
            help={errors.selling_price?.message}
          >
            <Controller
              control={control}
              name="selling_price"
              render={({ field }) => <InputNumber {...field} {...currencyInputProps} />}
            />
          </Form.Item>

          <Form.Item
            label={t('transaction.quickItem.quantity')}
            required
            validateStatus={errors.quantity ? 'error' : undefined}
            help={errors.quantity?.message}
          >
            <Controller
              control={control}
              name="quantity"
              render={({ field }) => <InputNumber {...field} className="w-full" min={0} />}
            />
          </Form.Item>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Form.Item
            label={t('transaction.quickItem.unit')}
            required
            validateStatus={errors.unit ? 'error' : undefined}
            help={errors.unit?.message}
          >
            <Controller
              control={control}
              name="unit"
              render={({ field }) => <Select {...field} className="w-full" options={unitOptions} showSearch />}
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
          {estimatePreview.isGuessed && Number(watchedSellingPrice || 0) > 0 && (
            <div className="mt-1">
              {t('transaction.quickItem.estimatedCostHint', {
                price: formatCurrency(estimatePreview.price),
              })}
            </div>
          )}
        </div>

        <Button type="primary" block htmlType="submit" loading={isSubmitting}>
          {t('transaction.quickItem.submit')}
        </Button>
      </form>
    </Form>
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

  return (
    <Modal
      title={topUpProduct ? t('transaction.quickItem.topUpTitle') : t('transaction.quickItem.title')}
      open={open}
      onCancel={onCancel}
      footer={null}
      destroyOnClose
    >
      {topUpProduct ? (
        <QuickItemTopUpForm open={open} product={topUpProduct} onResolved={onResolved} />
      ) : (
        <QuickItemCreateForm
          open={open}
          initialBarcode={initialBarcode}
          initialName={initialName}
          onResolved={onResolved}
        />
      )}
    </Modal>
  );
};
