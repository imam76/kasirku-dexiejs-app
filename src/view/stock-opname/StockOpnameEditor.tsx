import { useMemo, useState } from 'react';
import { App, Button, Card, Empty, Input, Space, Typography } from 'antd';
import { ArrowLeft, Ban, Download, Save, Send, Upload } from 'lucide-react';
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

const { Title } = Typography;

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
    postDraft,
    cancelDraft,
    isUpdatingDraft,
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
      key={detail.opname.id}
      detail={detail}
      onBack={onBack}
      onPosted={onPosted}
      updateDraft={updateDraft}
      postDraft={postDraft}
      cancelDraft={cancelDraft}
      isUpdatingDraft={isUpdatingDraft}
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
  postDraft: ReturnType<typeof useStockOpnames>['postDraft'];
  cancelDraft: ReturnType<typeof useStockOpnames>['cancelDraft'];
  isUpdatingDraft: boolean;
  isPostingDraft: boolean;
  isCancellingDraft: boolean;
}

function StockOpnameEditorContent({
  detail,
  onBack,
  onPosted,
  updateDraft,
  postDraft,
  cancelDraft,
  isUpdatingDraft,
  isPostingDraft,
  isCancellingDraft,
}: StockOpnameEditorContentProps) {
  const { t } = useI18n();
  const { modal, message } = App.useApp();
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [countedAt, setCountedAt] = useState(() => detail.opname.counted_at);
  const [notes, setNotes] = useState(() => detail.opname.notes ?? '');
  const [items, setItems] = useState<StockOpnameItem[]>(() => detail.items);
  const opnameId = detail.opname.id;

  const summaryOpname = useMemo(() => {
    return {
      ...detail.opname,
      ...calculateStockOpnameSummary(items),
    };
  }, [detail, items]);

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
        await saveDraft();
        const result = await postDraft({ opnameId });
        onPosted(result.opname.id);
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
          <Button icon={<Upload size={16} />} onClick={() => setIsImportOpen(true)}>
            {t('stockOpname.importCsv')}
          </Button>
          <Button icon={<Save size={16} />} loading={isUpdatingDraft} onClick={saveDraft}>
            {t('stockOpname.saveDraft')}
          </Button>
          <Button danger icon={<Ban size={16} />} loading={isCancellingDraft} onClick={handleCancel}>
            {t('stockOpname.cancel')}
          </Button>
          <Button type="primary" icon={<Send size={16} />} loading={isPostingDraft} onClick={handlePost}>
            {t('stockOpname.post')}
          </Button>
        </Space>
      </div>

      <StockOpnameHeader
        opname={summaryOpname}
        countedAt={countedAt}
        notes={notes}
        editable
        onCountedAtChange={setCountedAt}
        onNotesChange={setNotes}
      />
      <StockOpnameSummary opname={summaryOpname} />
      <Card className="rounded-md">
        <StockOpnameItemTable items={items} editable onItemChange={handleItemChange} />
      </Card>
      <StockOpnameImportModal
        open={isImportOpen}
        onCancel={() => setIsImportOpen(false)}
        onImport={handleImportRows}
      />
    </div>
  );
}
