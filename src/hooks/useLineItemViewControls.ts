import { useCallback, useMemo, useState } from 'react';
import {
  countFilledLineItems,
  filterLineItemEntries,
  findDuplicateProductIds,
  type LineItemEntry,
  type LineItemLike,
} from '@/utils/documentLineItems/lineItemView';

export const useLineItemViewControls = <T extends LineItemLike>(items: T[]) => {
  const [searchText, setSearchText] = useState('');
  const isFiltering = searchText.trim().length > 0;

  const entries: Array<LineItemEntry<T>> = useMemo(
    () => filterLineItemEntries(items, searchText),
    [items, searchText],
  );

  const filledCount = useMemo(() => countFilledLineItems(items), [items]);

  const duplicateProductIds = useMemo(() => findDuplicateProductIds(items), [items]);

  const clearSearch = useCallback(() => setSearchText(''), []);

  return {
    searchText,
    setSearchText,
    clearSearch,
    isFiltering,
    entries,
    filledCount,
    duplicateProductIds,
  };
};
