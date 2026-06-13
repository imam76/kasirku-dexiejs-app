import { useMemo, useState } from 'react';
import { App, Button, Card, Empty, Input, Select, Space, Typography } from 'antd';
import { ArrowLeft, Ban, CheckCheck, Download, Eraser, RotateCcw, Save, Search, Send, Upload } from 'lucide-react';
import StockOpnameHeader from '@/components/stock-opname/StockOpnameHeader';
import StockOpnameImportModal from '@/components/stock-opname/StockOpnameImportModal';
import StockOpnameItemTable from '@/components/stock-opname/StockOpnameItemTable';
import StockOpnameSummary from '@/components/stock-opname/StockOpnameSummary';
import { Loading } from '@/components/Loading';
import { useI18n } from '@/hooks/useI18n';
import { useStockOpnames } from '@/hooks/useStockOpnames';
import type { StockOpnameDetailReadResult } from '@/services/stockOpnameReadService';
import type { StockOpnameItem } from '@/types';
import { exportCsv } from '@/utils/export';
import { calculateStockOpnameSummary, calculateStockOpnameVariance } from '@/utils/stockOpname/calculateStockOpnameVariance';
import { buildStockOpnameCsvRows, type StockOpnameCsvImportRow } from '@/utils/stockOpname/stockOpnameCsv';

const { Text, Title } = Typography;

type StockOpnameItemViewFilter = 'ALL' | 'UNCOUNTED' | 'COUNTED' | 'VARIANCE';

interface StockOpnameEditorProps {
  opnameId: string;
  onBack: () => void;
  onPosted: (opnameId: string) => void;
}

export default function StockOpnameEditor({
  opnameId,
  onBack,
  onPosted,
}: StockOpnameEditorProps) {
  const { t } = useI18n();
  const {
    detail,
    isLoadingDetail,
    updateDraft,
    reviewDraft,
    reopenReview,
    postDraft,
    cancelDraft,
    isUpdatingDraft,
    isReviewingDraft,
    isReopeningReview,
    isPostingDraft,
    isCancellingDraft,
  } = useStockOpnames({ detailId: opnameId });

  if (isLoadingDetail) {
    return <Loading />;
  }

  if (!detail) {
    return <Empty description={t('stockOpname.notFound')} />;
  }

  return (
    <StockOpnameEditorContent
      key={`${detail.opname.id}-${detail.opname.updated_at}`}
      detail={detail}
      onBack={onBack}
      onPosted={onPosted}
      updateDraft={updateDraft}
      reviewDraft={reviewDraft}
      reopenReview={reopenReview}
      postDraft={postDraft}
      cancelDraft={cancelDraft}
      isUpdatingDraft={isUpdatingDraft}
      isReviewingDraft={isReviewingDraft}
      isReopeningReview={isReopeningReview}
      isPostingDraft={isPostingDraft}
      isCancellingDraft={isCancellingDraft}
    />
  );
}

interface StockOpnameEditorContentProps {
  detail: StockOpnameDetailReadResult;
  onBack: () => void;
  onPosted: (opnameId: string) => void;
  updateDraft: ReturnType<typeof useStockOpnames>['updateDraft'];
  reviewDraft: ReturnType<typeof useStockOpnames>['reviewDraft'];
  reopenReview: ReturnType<typeof useStockOpnames>['reopenReview'];
  postDraft: ReturnType<typeof useStockOpnames>['postDraft'];
  cancelDraft: ReturnType<typeof useStockOpnames>['cancelDraft'];
  isUpdatingDraft: boolean;
  isReviewingDraft: boolean;
  isReopeningReview: boolean;
  isPostingDraft: boolean;
  isCancellingDraft: boolean;
}

function StockOpnameEditorContent({
  detail,
  onBack,
  onPosted,
  updateDraft,
  reviewDraft,
  reopenReview,
  postDraft,
  cancelDraft,
  isUpdatingDraft,
  isReviewingDraft,
  isReopeningReview,
  isPostingDraft,
  isCancellingDraft,
}: StockOpnameEditorContentProps) {
  const { t } = useI18n();
  const { modal, message } = App.useApp();
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [countedAt, setCountedAt] = useState(() => detail.opname.counted_at);
  const [notes, setNotes] = useState(() => detail.opname.notes ?? '');
  const [items, setItems] = useState<StockOpnameItem[]>(() => detail.items);
  const [itemSearchText, setItemSearchText] = useState('');
  const [itemViewFilter, setItemViewFilter] = useState<StockOpnameItemViewFilter>('ALL');
  const opnameId = detail.opname.id;
  const isEditable = detail.opname.status === 'DRAFT';
  const isReviewed = detail.opname.status === 'REVIEWED';

  const summaryOpname = useMemo(() => {
    return {
      ...detail.opname,
      ...calculateStockOpnameSummary(items),
    };
  }, [detail, items]);

  const filteredItems = useMemo(() => {
    const query = itemSearchText.trim().toLowerCase();

    return items.filter((item) => {
      const matchesSearch = !query || [
        item.product_name,
        item.sku,
        item.category,
        item.notes,
      ].some((value) => value?.toLowerCase().includes(query));
      const isCounted = item.counted_quantity !== undefined && item.counted_quantity !== null;
      const matchesFilter = (
        itemViewFilter === 'ALL' ||
        (itemViewFilter === 'UNCOUNTED' && !isCounted) ||
        (itemViewFilter === 'COUNTED' && isCounted) ||
        (itemViewFilter === 'VARIANCE' && item.quantity_delta !== 0)
      );

      return matchesSearch && matchesFilter;
    });
  }, [itemSearchText, itemViewFilter, items]);

  const countedItemCount = useMemo(
    () => items.filter((item) => item.counted_quantity !== undefined && item.counted_quantity !== null).length,
    [items],
  );

  const handleItemChange = (
    id: string,
    patch: Pick<StockOpnameItem, 'counted_quantity'> | Pick<StockOpnameItem, 'notes'>,
  ) => {
    setItems((currentItems) => currentItems.map((item) => {
      if (item.id !== id) return item;

      const nextItem = {
        ...item,
        ...patch,
      };
      const variance = calculateStockOpnameVariance({
        system_quantity: nextItem.system_quantity,
        counted_quantity: nextItem.counted_quantity,
        cost_per_unit: nextItem.cost_per_unit,
      });

      return {
        ...nextItem,
        quantity_delta: variance.quantity_delta,
        variance_value: variance.variance_value,
      };
    }));
  };

  const recalculateItem = (item: StockOpnameItem): StockOpnameItem => {
    const variance = calculateStockOpnameVariance({
      system_quantity: item.system_quantity,
      counted_quantity: item.counted_quantity,
      cost_per_unit: item.cost_per_unit,
    });

    return {
      ...item,
      quantity_delta: variance.quantity_delta,
      variance_value: variance.variance_value,
    };
  };

  const updateVisibleItems = (updater: (item: StockOpnameItem) => StockOpnameItem) => {
    const visibleItemIds = new Set(filteredItems.map((item) => item.id));
    setItems((currentItems) => currentItems.map((item) => (
      visibleItemIds.has(item.id) ? recalculateItem(updater(item)) : item
    )));
  };

  const fillVisibleWithSystemStock = () => {
    updateVisibleItems((item) => ({
      ...item,
      counted_quantity: item.system_quantity,
    }));
  };

  const clearVisibleCounts = () => {
    updateVisibleItems((item) => ({
      ...item,
      counted_quantity: undefined,
    }));
  };

  const saveDraft = async () => {
    await updateDraft({
      opnameId,
      countedAt,
      notes,
      items: items.map((item) => ({
        id: item.id,
        counted_quantity: item.counted_quantity,
        notes: item.notes,
      })),
    });
  };

  const handleExport = async () => {
    if (!detail) return;
    await exportCsv({
      filename: `${detail.opname.opname_number}.csv`,
      rows: buildStockOpnameCsvRows(items),
    });
  };

  const handleImportRows = (rows: StockOpnameCsvImportRow[]) => {
    const rowsByProductId = new Map(rows.map((row) => [row.product_id, row]));
    let appliedCount = 0;

    setItems((currentItems) => currentItems.map((item) => {
      const row = rowsByProductId.get(item.product_id);
      if (!row) return item;
      if (row.unit && row.unit !== item.unit) return item;

      appliedCount += 1;
      const nextItem = {
        ...item,
        counted_quantity: row.counted_quantity,
        notes: row.notes ?? item.notes,
      };
      const variance = calculateStockOpnameVariance({
        system_quantity: nextItem.system_quantity,
        counted_quantity: nextItem.counted_quantity,
        cost_per_unit: nextItem.cost_per_unit,
      });

      return {
        ...nextItem,
        quantity_delta: variance.quantity_delta,
        variance_value: variance.variance_value,
      };
    }));

    message.success(t('stockOpname.importApplied', { count: appliedCount }));
  };

  const handlePost = () => {
    modal.confirm({
      title: t('stockOpname.postConfirmTitle'),
      content: t('stockOpname.postConfirmContent'),
      okText: t('stockOpname.post'),
      cancelText: t('common.cancel'),
      onOk: async () => {
        const result = await postDraft({ opnameId });
        onPosted(result.opname.id);
      },
    });
  };

  const handleReview = () => {
    modal.confirm({
      title: t('stockOpname.reviewConfirmTitle'),
      content: t('stockOpname.reviewConfirmContent', {
        counted: countedItemCount,
        total: items.length,
      }),
      okText: t('stockOpname.review'),
      cancelText: t('common.cancel'),
      onOk: async () => {
        await saveDraft();
        await reviewDraft({ opnameId });
      },
    });
  };

  const handleReopen = () => {
    modal.confirm({
      title: t('stockOpname.reopenConfirmTitle'),
      content: t('stockOpname.reopenConfirmContent'),
      okText: t('stockOpname.reopen'),
      cancelText: t('common.cancel'),
      onOk: async () => {
        await reopenReview({ opnameId });
      },
    });
  };

  const handleCancel = () => {
    let reason = '';

    modal.confirm({
      title: t('stockOpname.cancelConfirmTitle'),
      content: (
        <Input.TextArea
          autoSize={{ minRows: 3, maxRows: 5 }}
          placeholder={t('stockOpname.cancelReasonPlaceholder')}
          onChange={(event) => {
            reason = event.target.value;
          }}
        />
      ),
      okText: t('stockOpname.cancel'),
      okType: 'danger',
      cancelText: t('common.cancel'),
      onOk: async () => {
        await cancelDraft({ opnameId, reason });
        onBack();
      },
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Space>
          <Button icon={<ArrowLeft size={16} />} onClick={onBack}>
            {t('common.back')}
          </Button>
          <Title level={4} className="!mb-0">
            {t('stockOpname.editorTitle')}
          </Title>
        </Space>
        <Space wrap>
          <Button icon={<Download size={16} />} onClick={handleExport}>
            {t('stockOpname.exportSheet')}
          </Button>
          {isEditable && (
            <>
              <Button icon={<Upload size={16} />} onClick={() => setIsImportOpen(true)}>
                {t('stockOpname.importCsv')}
              </Button>
              <Button icon={<Save size={16} />} loading={isUpdatingDraft} onClick={saveDraft}>
                {t('stockOpname.saveDraft')}
              </Button>
            </>
          )}
          <Button danger icon={<Ban size={16} />} loading={isCancellingDraft} onClick={handleCancel}>
            {t('stockOpname.cancel')}
          </Button>
          {isEditable && (
            <Button type="primary" icon={<CheckCheck size={16} />} loading={isReviewingDraft} onClick={handleReview}>
              {t('stockOpname.review')}
            </Button>
          )}
          {isReviewed && (
            <>
              <Button icon={<RotateCcw size={16} />} loading={isReopeningReview} onClick={handleReopen}>
                {t('stockOpname.reopen')}
              </Button>
              <Button type="primary" icon={<Send size={16} />} loading={isPostingDraft} onClick={handlePost}>
                {t('stockOpname.post')}
              </Button>
            </>
          )}
        </Space>
      </div>

      <StockOpnameHeader
        opname={summaryOpname}
        countedAt={countedAt}
        notes={notes}
        editable={isEditable}
        onCountedAtChange={setCountedAt}
        onNotesChange={setNotes}
      />
      <StockOpnameSummary opname={summaryOpname} />
      <Card className="rounded-md">
        <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <Space wrap>
            <Input
              allowClear
              prefix={<Search size={16} />}
              value={itemSearchText}
              placeholder={t('stockOpname.itemSearchPlaceholder')}
              className="w-full min-w-[220px] sm:w-72"
              onChange={(event) => setItemSearchText(event.target.value)}
            />
            <Select<StockOpnameItemViewFilter>
              value={itemViewFilter}
              className="w-48"
              onChange={setItemViewFilter}
              options={[
                { value: 'ALL', label: t('stockOpname.itemFilter.ALL') },
                { value: 'UNCOUNTED', label: t('stockOpname.itemFilter.UNCOUNTED') },
                { value: 'COUNTED', label: t('stockOpname.itemFilter.COUNTED') },
                { value: 'VARIANCE', label: t('stockOpname.itemFilter.VARIANCE') },
              ]}
            />
          </Space>
          <Space wrap>
            <Text type="secondary">
              {t('stockOpname.countProgress', {
                counted: countedItemCount,
                total: items.length,
                visible: filteredItems.length,
              })}
            </Text>
            {isEditable && (
              <>
                <Button icon={<CheckCheck size={16} />} onClick={fillVisibleWithSystemStock}>
                  {t('stockOpname.fillVisibleSystemStock')}
                </Button>
                <Button icon={<Eraser size={16} />} onClick={clearVisibleCounts}>
                  {t('stockOpname.clearVisibleCounts')}
                </Button>
              </>
            )}
          </Space>
        </div>
        <StockOpnameItemTable
          items={filteredItems}
          editable={isEditable}
          onItemChange={handleItemChange}
        />
      </Card>
      {isEditable && (
        <StockOpnameImportModal
          open={isImportOpen}
          onCancel={() => setIsImportOpen(false)}
          onImport={handleImportRows}
        />
      )}
    </div>
  );
}
