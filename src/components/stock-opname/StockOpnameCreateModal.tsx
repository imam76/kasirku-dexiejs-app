import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DatePicker, Form, Input, Modal, Select, Space, Statistic } from 'antd';
import dayjs from '@/lib/dayjs';
import { useI18n } from '@/hooks/useI18n';
import { getProductCategoryLabel, getProductCategoryOptions } from '@/i18n/stock';
import {
  getStockOpnameCandidates,
  type StockOpnameCandidateFilters,
} from '@/services/stockOpnameReadService';
import type { CreateStockOpnameDraftInput } from '@/services/stockOpnameService';
import { stockOpnameQueryKeys } from '@/hooks/useStockOpnames';

interface StockOpnameCreateModalProps {
  open: boolean;
  loading?: boolean;
  onCancel: () => void;
  onCreate: (input: CreateStockOpnameDraftInput) => Promise<void>;
}

export default function StockOpnameCreateModal({
  open,
  loading = false,
  onCancel,
  onCreate,
}: StockOpnameCreateModalProps) {
  const { t } = useI18n();
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [category, setCategory] = useState('');
  const [countedAt, setCountedAt] = useState(() => dayjs());
  const [notes, setNotes] = useState('');
  const categoryOptions = useMemo(() => getProductCategoryOptions(t), [t]);

  const candidateFilters = useMemo<StockOpnameCandidateFilters>(() => ({
    category,
  }), [category]);

  const candidatesQuery = useQuery({
    queryKey: stockOpnameQueryKeys.candidates(candidateFilters),
    queryFn: () => getStockOpnameCandidates(candidateFilters),
    enabled: open,
  });

  const productOptions = useMemo(() => (
    (candidatesQuery.data ?? []).map((product) => ({
      value: product.id,
      label: [
        product.name,
        product.sku,
        product.category ? getProductCategoryLabel(product.category, t) : undefined,
      ].filter(Boolean).join(' - '),
    }))
  ), [candidatesQuery.data, t]);

  const scopedProductCount = selectedProductIds.length || candidatesQuery.data?.length || 0;

  const handleCreate = async () => {
    await onCreate({
      productIds: selectedProductIds.length > 0 ? selectedProductIds : undefined,
      category,
      countedAt: countedAt.toISOString(),
      notes,
    });
    setSelectedProductIds([]);
    setCategory('');
    setCountedAt(dayjs());
    setNotes('');
  };

  return (
    <Modal
      open={open}
      title={t('stockOpname.create')}
      okText={t('stockOpname.create')}
      cancelText={t('common.cancel')}
      confirmLoading={loading}
      onCancel={onCancel}
      onOk={handleCreate}
    >
      <Form layout="vertical">
        <Form.Item label={t('stockOpname.countedAt')}>
          <DatePicker
            showTime
            value={countedAt}
            format="DD MMM YYYY HH:mm"
            className="w-full"
            onChange={(value) => {
              if (value) setCountedAt(value);
            }}
          />
        </Form.Item>
        <Form.Item label={t('stockOpname.productFilter')}>
          <Select
            mode="multiple"
            allowClear
            showSearch
            maxTagCount="responsive"
            value={selectedProductIds}
            loading={candidatesQuery.isFetching}
            options={productOptions}
            optionFilterProp="label"
            placeholder={t('stockOpname.productFilterPlaceholder')}
            onChange={setSelectedProductIds}
          />
        </Form.Item>
        <Form.Item label={t('stockOpname.categoryFilter')}>
          <Select
            allowClear
            showSearch
            value={category || undefined}
            options={categoryOptions}
            optionFilterProp="label"
            placeholder={t('stockOpname.categoryFilterPlaceholder')}
            onChange={(value) => {
              setCategory(value ?? '');
              setSelectedProductIds([]);
            }}
          />
        </Form.Item>
        <Form.Item label={t('stockOpname.notes')}>
          <Input.TextArea
            autoSize={{ minRows: 2, maxRows: 4 }}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </Form.Item>
        <Space className="w-full justify-between rounded border border-gray-200 px-3 py-2">
          <Statistic
            title={t('stockOpname.matchingProducts')}
            value={scopedProductCount}
            loading={candidatesQuery.isFetching}
          />
          <span className="text-xs text-gray-500">{t('stockOpname.createScopeHint')}</span>
        </Space>
      </Form>
    </Modal>
  );
}
