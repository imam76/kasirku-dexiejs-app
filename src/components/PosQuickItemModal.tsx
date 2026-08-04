import { App, Button, Input, InputNumber, Modal, Select, Tag, Typography } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '@/hooks/useI18n';
import { useUnits } from '@/hooks/useUnits';
import {
  createPosQuickItem,
  findPosQuickItemCandidates,
  linkBarcodeToExistingProduct,
  receiveQuickStockForProduct,
  resolveQuickItemEstimatedCost,
  type PosQuickItemCandidate,
} from '@/services/posQuickItemService';
import type { Product } from '@/types';
import { formatCurrency } from '@/utils/formatters';

const { Text } = Typography;

const CANDIDATE_LOOKUP_DELAY = 250;

interface PosQuickItemModalProps {
  open: boolean;
  initialBarcode?: string;
  initialName?: string;
  onCancel: () => void;
  onResolved: (product: Product) => void;
}

export const PosQuickItemModal = ({
  open,
  initialBarcode = '',
  initialName = '',
  onCancel,
  onResolved,
}: PosQuickItemModalProps) => {
  const { t } = useI18n();
  const { message } = App.useApp();
  const { unitOptions } = useUnits();

  const [name, setName] = useState(initialName);
  const [barcode, setBarcode] = useState(initialBarcode);
  const [sellingPrice, setSellingPrice] = useState<number | null>(null);
  const [quantity, setQuantity] = useState<number | null>(1);
  const [unit, setUnit] = useState('pcs');
  const [estimatedCost, setEstimatedCost] = useState<number | null>(null);
  const [candidates, setCandidates] = useState<PosQuickItemCandidate[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;

    setName(initialName);
    setBarcode(initialBarcode);
    setSellingPrice(null);
    setQuantity(1);
    setUnit('pcs');
    setEstimatedCost(null);
    setCandidates([]);
  }, [open, initialBarcode, initialName]);

  useEffect(() => {
    if (!open) return;

    let active = true;
    const timer = window.setTimeout(async () => {
      const found = await findPosQuickItemCandidates(name);
      if (active) setCandidates(found);
    }, CANDIDATE_LOOKUP_DELAY);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [name, open]);

  const estimatePreview = useMemo(
    () => resolveQuickItemEstimatedCost(Number(sellingPrice || 0), Number(estimatedCost || 0)),
    [sellingPrice, estimatedCost],
  );

  const handleUseCandidate = async (candidate: PosQuickItemCandidate) => {
    setIsSubmitting(true);
    try {
      let product = candidate.product;

      if (barcode.trim() && !candidate.hasBarcode) {
        product = await linkBarcodeToExistingProduct(product.id, barcode);
        message.success(t('transaction.quickItem.barcodeLinked', { name: product.name }));
      }

      // Produk lama yang stok sistemnya habis tetap perlu penerimaan barang dulu,
      // kalau tidak keranjang akan menolaknya.
      if (product.stock <= 0) {
        const result = await receiveQuickStockForProduct({
          productId: product.id,
          quantity: Number(quantity || 0),
          estimatedPurchasePrice: Number(estimatedCost || 0),
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

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      const result = await createPosQuickItem({
        name,
        barcode,
        sellingPrice: Number(sellingPrice || 0),
        quantity: Number(quantity || 0),
        unit,
        estimatedPurchasePrice: Number(estimatedCost || 0),
      });

      message.success(result.isEstimateGuessed
        ? t('transaction.quickItem.createdEstimated', { name: result.product.name })
        : t('transaction.quickItem.created', {
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
    <Modal
      title={t('transaction.quickItem.title')}
      open={open}
      onCancel={onCancel}
      footer={null}
      destroyOnClose
    >
      <div className="flex flex-col gap-3">
        <div className="text-sm text-gray-600">{t('transaction.quickItem.intro')}</div>

        <div>
          <div className="mb-1"><Text strong>{t('transaction.quickItem.name')}</Text></div>
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t('transaction.quickItem.namePlaceholder')}
            autoFocus
          />
        </div>

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
                    disabled={isSubmitting}
                    onClick={() => void handleUseCandidate(candidate)}
                  >
                    {t('transaction.quickItem.useCandidate')}
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <div className="mb-1"><Text strong>{t('transaction.quickItem.barcode')}</Text></div>
          <Input
            value={barcode}
            onChange={(event) => setBarcode(event.target.value)}
            placeholder={t('transaction.quickItem.barcodePlaceholder')}
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <div className="mb-1"><Text strong>{t('transaction.quickItem.sellingPrice')}</Text></div>
            <InputNumber className="w-full" min={0} value={sellingPrice} onChange={setSellingPrice} />
          </div>
          <div>
            <div className="mb-1"><Text strong>{t('transaction.quickItem.quantity')}</Text></div>
            <InputNumber className="w-full" min={0} value={quantity} onChange={setQuantity} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <div className="mb-1"><Text strong>{t('transaction.quickItem.unit')}</Text></div>
            <Select className="w-full" value={unit} onChange={setUnit} options={unitOptions} showSearch />
          </div>
          <div>
            <div className="mb-1">
              <Text strong>{t('transaction.quickItem.estimatedCost')}</Text>
              <Text type="secondary" className="ml-1 text-xs">
                ({t('transaction.quickItem.estimatedCostOptional')})
              </Text>
            </div>
            <InputNumber className="w-full" min={0} value={estimatedCost} onChange={setEstimatedCost} />
          </div>
        </div>

        {estimatePreview.isGuessed && Number(sellingPrice || 0) > 0 && (
          <div className="rounded bg-gray-50 p-2 text-xs text-gray-600">
            {t('transaction.quickItem.estimatedCostHint', {
              price: formatCurrency(estimatePreview.price),
            })}
          </div>
        )}

        <Button
          type="primary"
          block
          loading={isSubmitting}
          disabled={!name.trim() || !Number(sellingPrice || 0) || !Number(quantity || 0)}
          onClick={() => void handleSubmit()}
        >
          {t('transaction.quickItem.submit')}
        </Button>
      </div>
    </Modal>
  );
};
