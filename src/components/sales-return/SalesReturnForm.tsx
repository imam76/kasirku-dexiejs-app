import { Alert, Button, Card, DatePicker, Input, Select, Space } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import type { Dayjs } from 'dayjs';
import dayjs from '@/lib/dayjs';
import { useI18n } from '@/hooks/useI18n';
import type {
  SalesDocument,
  SalesReturn,
  SalesReturnItem,
  SalesReturnResolution,
  SalesReturnSourceType,
  SalesReturnableSource,
} from '@/types';
import type { SalesReturnItemInput, SalesReturnUpsertInput } from '@/services/salesReturnService';
import type { TranslationKey } from '@/i18n/messages';
import { calculateSalesReturnTotal } from '@/utils/salesReturns/calculateSalesReturnTotal';
import { mapSalesReturnSourceItem } from '@/utils/salesReturns/mapSalesReturnSourceItem';
import { SalesReturnLineItems } from './SalesReturnLineItems';
import { SalesReturnSummary } from './SalesReturnSummary';

interface SalesReturnFormProps {
  initialData?: {
    salesReturn?: SalesReturn;
    items?: SalesReturnItem[];
  };
  initialSourceType?: SalesReturnSourceType;
  initialSourceId?: string;
  returnableSources: SalesDocument[];
  loadSource: (sourceType: SalesReturnSourceType, sourceId: string) => Promise<SalesReturnableSource>;
  onSubmit: (input: SalesReturnUpsertInput) => Promise<void>;
  onCancel?: () => void;
  submitting?: boolean;
}

const resolutionOptions: Array<{ value: SalesReturnResolution; labelKey: TranslationKey }> = [
  { value: 'NO_FINANCE', labelKey: 'salesReturns.resolution.noFinance' },
  { value: 'CREDIT_NOTE', labelKey: 'salesReturns.resolution.creditNote' },
  { value: 'REFUND', labelKey: 'salesReturns.resolution.refund' },
];

const createSourceKey = (sourceType?: SalesReturnSourceType, sourceId?: string) => (
  sourceType && sourceId ? `${sourceType}:${sourceId}` : undefined
);

const parseSourceKey = (sourceKey?: string) => {
  if (!sourceKey) return undefined;
  const [sourceType, sourceId] = sourceKey.split(':');
  if (
    sourceType !== 'SALES_DELIVERY' &&
    sourceType !== 'SALES_INVOICE' &&
    sourceType !== 'POS_TRANSACTION'
  ) {
    return undefined;
  }

  return { sourceType, sourceId } as { sourceType: SalesReturnSourceType; sourceId: string };
};

const toInputItems = (items: SalesReturnItem[] = []): SalesReturnItemInput[] => (
  items.map((item) => ({
    source_item_id: item.source_item_id,
    quantity: item.quantity,
    condition: item.condition,
    restock_quantity: item.restock_quantity,
  }))
);

const isResolutionAllowed = (
  source: SalesReturnableSource | undefined,
  resolution: SalesReturnResolution,
  totalAmount: number,
) => {
  if (!source) return true;

  if (source.source_type === 'SALES_DELIVERY') {
    return resolution === 'NO_FINANCE';
  }

  if (source.source_type === 'SALES_INVOICE') {
    if (resolution === 'NO_FINANCE') {
      return totalAmount <= 0;
    }

    if (resolution === 'CREDIT_NOTE') {
      return Boolean(source.limits && source.limits.credit_note_limit > 0 && totalAmount <= source.limits.credit_note_limit + 0.01);
    }

    if (resolution === 'REFUND') {
      return Boolean(source.limits && source.limits.refund_limit > 0 && totalAmount <= source.limits.refund_limit + 0.01);
    }
  }

  return resolution === 'NO_FINANCE';
};

const getPreferredResolution = (
  source: SalesReturnableSource,
  totalAmount: number,
): SalesReturnResolution => {
  const preferred: SalesReturnResolution[] = source.source_type === 'SALES_INVOICE'
    ? ['CREDIT_NOTE', 'REFUND', 'NO_FINANCE']
    : ['NO_FINANCE'];

  return preferred.find((candidate) => isResolutionAllowed(source, candidate, totalAmount)) ?? 'NO_FINANCE';
};

export const SalesReturnForm = ({
  initialData,
  initialSourceType,
  initialSourceId,
  returnableSources,
  loadSource,
  onSubmit,
  onCancel,
  submitting,
}: SalesReturnFormProps) => {
  const { t } = useI18n();
  const initialReturn = initialData?.salesReturn;
  const [sourceKey, setSourceKey] = useState<string | undefined>(
    createSourceKey(initialReturn?.source_type ?? initialSourceType, initialReturn?.source_id ?? initialSourceId),
  );
  const [source, setSource] = useState<SalesReturnableSource | undefined>();
  const [documentDate, setDocumentDate] = useState<Dayjs>(
    initialReturn?.document_date ? dayjs(initialReturn.document_date) : dayjs(),
  );
  const [resolution, setResolution] = useState<SalesReturnResolution>(initialReturn?.resolution ?? 'NO_FINANCE');
  const [reason, setReason] = useState(initialReturn?.reason ?? '');
  const [items, setItems] = useState<SalesReturnItemInput[]>(toInputItems(initialData?.items));
  const [loadError, setLoadError] = useState<string>();

  useEffect(() => {
    const parsedSource = parseSourceKey(sourceKey);
    if (!parsedSource) {
      return;
    }

    let isCurrent = true;

    loadSource(parsedSource.sourceType, parsedSource.sourceId)
      .then((loadedSource) => {
        if (!isCurrent) return;
        setSource(loadedSource);
        setLoadError(undefined);
        if (!initialReturn) {
          setResolution(getPreferredResolution(loadedSource, 0));
        }
      })
      .catch((error: Error) => {
        if (!isCurrent) return;
        setSource(undefined);
        setLoadError(error.message);
      });

    return () => {
      isCurrent = false;
    };
  }, [initialReturn, loadSource, sourceKey]);

  const sourceOptions = useMemo(
    () => returnableSources.map((document) => ({
      value: createSourceKey(document.type as SalesReturnSourceType, document.id) ?? '',
      label: `${document.document_number} - ${document.customer_name}`,
    })),
    [returnableSources],
  );

  const total = useMemo(() => {
    if (!source) {
      return calculateSalesReturnTotal([]);
    }

    const sourceItemsById = new Map(source.items.map((item) => [item.source_item_id, item]));
    const mappedItems = items
      .filter((item) => Number(item.quantity || 0) > 0)
      .map((item) => {
        const sourceItem = sourceItemsById.get(item.source_item_id);
        if (!sourceItem) return undefined;

        return mapSalesReturnSourceItem({
          sourceItem,
          returnId: initialReturn?.id || 'draft',
          quantity: item.quantity,
          condition: item.condition,
          restockQuantity: item.restock_quantity,
          itemId: item.source_item_id,
        });
      })
      .filter((item): item is SalesReturnItem => Boolean(item));

    return calculateSalesReturnTotal(mappedItems);
  }, [initialReturn?.id, items, source]);

  const parsedSource = parseSourceKey(sourceKey);
  const hasPricing = Boolean(source?.items.some((item) => Number(item.total_amount || 0) > 0));
  const selectedItems = items.filter((item) => Number(item.quantity || 0) > 0);
  const hasSelectedItems = selectedItems.length > 0;
  const invalidResolution = source ? !isResolutionAllowed(source, resolution, total.total_amount) : false;

  return (
    <div className="space-y-4">
      <Card size="small">
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <div className="mb-1 text-xs font-medium text-gray-500">{t('salesReturns.field.source')}</div>
            <Select
              showSearch
              disabled={Boolean(initialReturn)}
              value={sourceKey}
              options={sourceOptions}
              placeholder={t('salesReturns.placeholder.source')}
              onChange={(value) => {
                setSource(undefined);
                setLoadError(undefined);
                setSourceKey(value);
                setItems([]);
              }}
              className="w-full"
              filterOption={(input, option) => String(option?.label ?? '').toLowerCase().includes(input.toLowerCase())}
            />
          </div>
          <div>
            <div className="mb-1 text-xs font-medium text-gray-500">{t('salesReturns.field.documentDate')}</div>
            <DatePicker value={documentDate} onChange={(value) => setDocumentDate(value || dayjs())} className="w-full" />
          </div>
          <div>
            <div className="mb-1 text-xs font-medium text-gray-500">{t('salesReturns.field.resolution')}</div>
            <Select
              value={resolution}
              options={resolutionOptions.map((option) => ({
                value: option.value,
                label: t(option.labelKey),
                disabled: !isResolutionAllowed(source, option.value, total.total_amount),
              }))}
              onChange={setResolution}
              className="w-full"
            />
          </div>
          <div>
            <div className="mb-1 text-xs font-medium text-gray-500">{t('salesReturns.field.reason')}</div>
            <Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder={t('salesReturns.placeholder.reason')} />
          </div>
        </div>
      </Card>

      {loadError && <Alert type="error" message={loadError} showIcon />}
      {source?.source_chain_label && <Alert type="info" message={source.source_chain_label} showIcon />}
      {invalidResolution && (
        <Alert
          type="warning"
          message={t('salesReturns.limit.resolutionExceeded')}
          showIcon
        />
      )}

      {source ? (
        <>
          <SalesReturnLineItems
            sourceItems={source.items}
            items={items}
            hasPricing={hasPricing}
            onChange={setItems}
          />
          <SalesReturnSummary
            subtotalAmount={total.subtotal_amount}
            discountAmount={total.discount_amount}
            taxAmount={total.tax_amount}
            totalAmount={total.total_amount}
            restockQuantity={total.restock_quantity}
            resolution={resolution}
            limits={source.limits}
          />
        </>
      ) : (
        <Alert type="info" message={t('salesReturns.selectSourceInfo')} showIcon />
      )}

      <div className="flex justify-end">
        <Space>
          {onCancel && <Button onClick={onCancel}>{t('common.cancel')}</Button>}
          <Button
            type="primary"
            loading={submitting}
            disabled={!source || !parsedSource || !hasSelectedItems || invalidResolution}
            onClick={async () => {
              if (!parsedSource || !source) return;

              await onSubmit({
                salesReturn: {
                  source_type: parsedSource.sourceType,
                  source_id: parsedSource.sourceId,
                  document_date: documentDate.format('YYYY-MM-DD'),
                  resolution,
                  reason,
                  refund_amount: resolution === 'REFUND' ? total.total_amount : 0,
                  credit_amount: resolution === 'CREDIT_NOTE' ? total.total_amount : 0,
                },
                items: selectedItems,
              });
            }}
          >
            {t('salesReturns.saveDraft')}
          </Button>
        </Space>
      </div>
    </div>
  );
};
