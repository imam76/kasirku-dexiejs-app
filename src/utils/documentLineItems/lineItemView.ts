export interface LineItemLike {
  id: string;
  product_id: string;
  product_name: string;
  sku?: string;
  subtotal?: number;
  created_at?: string;
}

export interface LineItemEntry<T> {
  item: T;
  originalIndex: number;
}

export type LineItemSortKey =
  | 'name-asc'
  | 'name-desc'
  | 'subtotal-desc'
  | 'subtotal-asc'
  | 'created-asc';

export const isFilledLineItem = (item: LineItemLike) => Boolean(item.product_id);

export const countFilledLineItems = (items: LineItemLike[]) =>
  items.filter(isFilledLineItem).length;

export const filterLineItemEntries = <T extends LineItemLike>(
  items: T[],
  searchText: string,
): Array<LineItemEntry<T>> => {
  const entries = items.map((item, originalIndex) => ({ item, originalIndex }));
  const query = searchText.trim().toLowerCase();
  if (!query) return entries;

  return entries.filter(({ item }) => (
    item.product_name.toLowerCase().includes(query) ||
    (item.sku ?? '').toLowerCase().includes(query)
  ));
};

export const findDuplicateProductIds = (items: LineItemLike[]): Set<string> => {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const item of items) {
    if (!item.product_id) continue;
    if (seen.has(item.product_id)) duplicates.add(item.product_id);
    seen.add(item.product_id);
  }

  return duplicates;
};

export interface PersistedLineItemOrder {
  id: string;
  sort_order?: number;
  created_at?: string;
}

// Dexie mengembalikan item terurut UUID (primary key), bukan urutan input. sort_order
// ditulis dari index array saat save; created_at + id hanya fallback untuk data lama
// yang tersimpan sebelum kolom ini ada.
export const orderLineItemsForDisplay = <T extends PersistedLineItemOrder>(items: T[]): T[] =>
  [...items].sort((a, b) => {
    const orderA = a.sort_order ?? Number.MAX_SAFE_INTEGER;
    const orderB = b.sort_order ?? Number.MAX_SAFE_INTEGER;
    if (orderA !== orderB) return orderA - orderB;
    const byCreated = (a.created_at ?? '').localeCompare(b.created_at ?? '');
    if (byCreated !== 0) return byCreated;
    return a.id.localeCompare(b.id);
  });

export const sortLineItems = <T extends LineItemLike>(
  items: T[],
  sortKey: LineItemSortKey,
  subtotalById?: Map<string, number>,
): T[] => {
  const filled = items.filter(isFilledLineItem);
  const blank = items.filter((item) => !isFilledLineItem(item));

  const getSubtotal = (item: T) => subtotalById?.get(item.id) ?? item.subtotal ?? 0;
  const byName = (a: T, b: T) =>
    a.product_name.localeCompare(b.product_name, undefined, { sensitivity: 'base' });
  const byCreated = (a: T, b: T) => (a.created_at ?? '').localeCompare(b.created_at ?? '');

  const comparators: Record<LineItemSortKey, (a: T, b: T) => number> = {
    'name-asc': byName,
    'name-desc': (a, b) => byName(b, a),
    'subtotal-desc': (a, b) => getSubtotal(b) - getSubtotal(a),
    'subtotal-asc': (a, b) => getSubtotal(a) - getSubtotal(b),
    'created-asc': byCreated,
  };

  return [...filled.sort(comparators[sortKey]), ...blank];
};
