import { describe, expect, test } from 'bun:test';
import {
  countFilledLineItems,
  filterLineItemEntries,
  findDuplicateProductIds,
  orderLineItemsForDisplay,
  sortLineItems,
  type LineItemLike,
} from '@/utils/documentLineItems/lineItemView';

const makeItem = (overrides: Partial<LineItemLike> & { id: string }): LineItemLike => ({
  product_id: '',
  product_name: '',
  ...overrides,
});

const filledA = makeItem({ id: 'a', product_id: 'p1', product_name: 'Gula Pasir', sku: 'GP-01', subtotal: 5000, created_at: '2026-08-01T10:00:00Z' });
const filledB = makeItem({ id: 'b', product_id: 'p2', product_name: 'Beras Premium', sku: 'BR-77', subtotal: 12000, created_at: '2026-08-01T09:00:00Z' });
const filledC = makeItem({ id: 'c', product_id: 'p3', product_name: 'kopi bubuk', sku: 'KB-05', subtotal: 8000, created_at: '2026-08-01T11:00:00Z' });
const blank1 = makeItem({ id: 'x', created_at: '2026-08-01T12:00:00Z' });
const blank2 = makeItem({ id: 'y', created_at: '2026-08-01T12:00:01Z' });

describe('countFilledLineItems', () => {
  test('counts only rows that have a product, ignoring seeded blank rows', () => {
    expect(countFilledLineItems([filledA, blank1, filledB, blank2])).toBe(2);
    expect(countFilledLineItems([])).toBe(0);
  });
});

describe('filterLineItemEntries', () => {
  const items = [filledA, blank1, filledB, filledC];

  test('returns every row with its original index when the query is blank', () => {
    const entries = filterLineItemEntries(items, '   ');
    expect(entries).toHaveLength(4);
    expect(entries.map((entry) => entry.originalIndex)).toEqual([0, 1, 2, 3]);
  });

  test('matches product name case-insensitively and keeps original indexes', () => {
    const entries = filterLineItemEntries(items, 'KOPI');
    expect(entries).toHaveLength(1);
    expect(entries[0].item.id).toBe('c');
    expect(entries[0].originalIndex).toBe(3);
  });

  test('matches by SKU', () => {
    const entries = filterLineItemEntries(items, 'br-77');
    expect(entries.map((entry) => entry.item.id)).toEqual(['b']);
  });

  test('blank rows never match a non-empty query', () => {
    expect(filterLineItemEntries([blank1, blank2], 'gula')).toHaveLength(0);
  });
});

describe('findDuplicateProductIds', () => {
  test('flags product ids that appear in more than one filled row', () => {
    const duplicate = makeItem({ id: 'z', product_id: 'p1', product_name: 'Gula Pasir' });
    const duplicates = findDuplicateProductIds([filledA, filledB, duplicate, blank1]);
    expect(duplicates.has('p1')).toBe(true);
    expect(duplicates.has('p2')).toBe(false);
    expect(duplicates.size).toBe(1);
  });

  test('ignores blank rows entirely', () => {
    expect(findDuplicateProductIds([blank1, blank2]).size).toBe(0);
  });
});

describe('sortLineItems', () => {
  const items = [blank1, filledA, filledB, blank2, filledC];

  test('sorts by product name ascending, keeping blank rows at the bottom in original order', () => {
    const sorted = sortLineItems(items, 'name-asc');
    expect(sorted.map((item) => item.id)).toEqual(['b', 'a', 'c', 'x', 'y']);
  });

  test('sorts by product name descending', () => {
    const sorted = sortLineItems(items, 'name-desc');
    expect(sorted.map((item) => item.id)).toEqual(['c', 'a', 'b', 'x', 'y']);
  });

  test('sorts by subtotal, preferring the calculated subtotal map over the raw item value', () => {
    const subtotalById = new Map([['a', 99000]]);
    const sorted = sortLineItems(items, 'subtotal-desc', subtotalById);
    expect(sorted.map((item) => item.id)).toEqual(['a', 'b', 'c', 'x', 'y']);
  });

  test('sorts by subtotal ascending using raw values when no map is given', () => {
    const sorted = sortLineItems(items, 'subtotal-asc');
    expect(sorted.map((item) => item.id)).toEqual(['a', 'c', 'b', 'x', 'y']);
  });

  test('restores input-time order via created_at', () => {
    const shuffled = [filledC, blank1, filledA, filledB];
    const sorted = sortLineItems(shuffled, 'created-asc');
    expect(sorted.map((item) => item.id)).toEqual(['b', 'a', 'c', 'x']);
  });

  test('does not mutate the input array', () => {
    const input = [...items];
    sortLineItems(input, 'name-asc');
    expect(input.map((item) => item.id)).toEqual(items.map((item) => item.id));
  });
});

describe('orderLineItemsForDisplay', () => {
  test('restores persisted order by sort_order regardless of fetch order', () => {
    const fetched = [
      { id: 'c', sort_order: 2, created_at: '2026-08-01T10:00:00.000Z' },
      { id: 'a', sort_order: 0, created_at: '2026-08-01T10:00:00.000Z' },
      { id: 'b', sort_order: 1, created_at: '2026-08-01T10:00:00.000Z' },
    ];
    expect(orderLineItemsForDisplay(fetched).map((item) => item.id)).toEqual(['a', 'b', 'c']);
  });

  test('places legacy rows without sort_order after ordered rows, sorted by created_at then id', () => {
    const fetched = [
      { id: 'z', created_at: '2026-08-01T09:00:00.000Z' },
      { id: 'b', sort_order: 1, created_at: '2026-08-01T12:00:00.000Z' },
      { id: 'y', created_at: '2026-08-01T08:00:00.000Z' },
      { id: 'a', sort_order: 0, created_at: '2026-08-01T12:00:00.000Z' },
    ];
    expect(orderLineItemsForDisplay(fetched).map((item) => item.id)).toEqual(['a', 'b', 'y', 'z']);
  });

  test('breaks identical created_at ties deterministically by id', () => {
    const sameInstant = '2026-08-01T10:00:00.000Z';
    const fetched = [
      { id: 'b', created_at: sameInstant },
      { id: 'a', created_at: sameInstant },
      { id: 'c', created_at: sameInstant },
    ];
    expect(orderLineItemsForDisplay(fetched).map((item) => item.id)).toEqual(['a', 'b', 'c']);
  });

  test('does not mutate the input array', () => {
    const fetched = [
      { id: 'b', sort_order: 1 },
      { id: 'a', sort_order: 0 },
    ];
    const snapshot = [...fetched];
    orderLineItemsForDisplay(fetched);
    expect(fetched).toEqual(snapshot);
  });
});
