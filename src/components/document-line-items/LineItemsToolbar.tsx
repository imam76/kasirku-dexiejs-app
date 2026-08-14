import { useMemo } from 'react';
import { Button, Dropdown, Input } from 'antd';
import { ArrowUpDown, Search } from 'lucide-react';
import { useI18n } from '@/hooks/useI18n';
import type { LineItemSortKey } from '@/utils/documentLineItems/lineItemView';

interface LineItemsToolbarProps {
  searchText: string;
  filledCount: number;
  visibleCount: number;
  totalCount: number;
  isFiltering: boolean;
  showSubtotalSort: boolean;
  onSearchChange: (value: string) => void;
  onSort: (key: LineItemSortKey) => void;
}

export const LineItemsToolbar = ({
  searchText,
  filledCount,
  visibleCount,
  totalCount,
  isFiltering,
  showSubtotalSort,
  onSearchChange,
  onSort,
}: LineItemsToolbarProps) => {
  const { t } = useI18n();

  const sortMenuItems = useMemo(() => [
    { key: 'name-asc', label: t('documentLineItems.sortNameAsc') },
    { key: 'name-desc', label: t('documentLineItems.sortNameDesc') },
    ...(showSubtotalSort ? [
      { key: 'subtotal-desc', label: t('documentLineItems.sortSubtotalDesc') },
      { key: 'subtotal-asc', label: t('documentLineItems.sortSubtotalAsc') },
    ] : []),
    { key: 'created-asc', label: t('documentLineItems.sortCreatedAsc') },
  ], [showSubtotalSort, t]);

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          allowClear
          className="w-full sm:max-w-xs"
          prefix={<Search size={14} className="text-gray-400" />}
          placeholder={t('documentLineItems.searchPlaceholder')}
          value={searchText}
          onChange={(event) => onSearchChange(event.target.value)}
        />
        <Dropdown
          trigger={['click']}
          menu={{
            items: sortMenuItems,
            onClick: ({ key }) => onSort(key as LineItemSortKey),
          }}
        >
          <Button icon={<ArrowUpDown size={14} />}>{t('documentLineItems.sort')}</Button>
        </Dropdown>
      </div>
      <div className="text-xs text-gray-500">
        <span className="font-medium text-gray-700">
          {t('documentLineItems.filledCount', { count: filledCount })}
        </span>
        {isFiltering && (
          <>
            {' · '}
            {t('documentLineItems.visibleCount', { visible: visibleCount, total: totalCount })}
          </>
        )}
      </div>
    </div>
  );
};
