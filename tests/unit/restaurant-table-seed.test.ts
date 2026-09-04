import { describe, expect, test } from 'bun:test';
import {
  previewRestaurantTableSeed,
  validateRestaurantTableSeedInput,
  RESTAURANT_TABLE_SEED_MAX_COUNT,
  type RestaurantTableSeedInput,
} from '@/services/restaurantTableService';

const buildSeedInput = (overrides: Partial<RestaurantTableSeedInput> = {}): RestaurantTableSeedInput => ({
  type: 'REGULAR',
  prefix: 'M',
  startNumber: 1,
  count: 3,
  digits: 2,
  capacity: 4,
  skipExisting: true,
  ...overrides,
});

const buildExistingTable = (name: string, isActive = true) => ({
  name,
  normalized_name: name.trim().toLocaleLowerCase('id-ID'),
  is_active: isActive,
});

describe('restaurant table bulk seed', () => {
  test('generates padded sequential names from the prefix and start number', () => {
    const result = validateRestaurantTableSeedInput(buildSeedInput({ count: 4, startNumber: 8 }));
    expect(result.names).toEqual(['M08', 'M09', 'M10', 'M11']);
  });

  test('keeps the spacing of a prefix that ends with a separator', () => {
    const result = validateRestaurantTableSeedInput(buildSeedInput({ type: 'VVIP', prefix: 'VVIP ', digits: 1 }));
    expect(result.names).toEqual(['VVIP 1', 'VVIP 2', 'VVIP 3']);
  });

  test('carries the selected type and capacity into the generated batch', () => {
    const result = validateRestaurantTableSeedInput(buildSeedInput({ type: 'VIP', capacity: 6 }));
    expect(result.type).toBe('VIP');
    expect(result.capacity).toBe(6);
  });

  test('rejects an unknown table type', () => {
    expect(() => validateRestaurantTableSeedInput(
      buildSeedInput({ type: 'PLATINUM' as never }),
    )).toThrow('Tipe meja tidak dikenal.');
  });

  test('rejects a batch larger than the seed limit', () => {
    expect(() => validateRestaurantTableSeedInput(
      buildSeedInput({ count: RESTAURANT_TABLE_SEED_MAX_COUNT + 1 }),
    )).toThrow(`Jumlah meja maksimal ${RESTAURANT_TABLE_SEED_MAX_COUNT} untuk sekali pembuatan.`);
  });

  test('rejects fractional counts, capacities, and digits', () => {
    expect(() => validateRestaurantTableSeedInput(buildSeedInput({ count: 2.5 }))).toThrow();
    expect(() => validateRestaurantTableSeedInput(buildSeedInput({ capacity: 0 }))).toThrow();
    expect(() => validateRestaurantTableSeedInput(buildSeedInput({ digits: 0 }))).toThrow();
    expect(() => validateRestaurantTableSeedInput(buildSeedInput({ digits: 9 }))).toThrow();
  });

  test('rejects a naming pattern that exceeds the table name limit', () => {
    expect(() => validateRestaurantTableSeedInput(
      buildSeedInput({ prefix: 'M'.repeat(80) }),
    )).toThrow(/80 karakter/);
  });

  test('splits the batch into creatable names and duplicates of active tables', () => {
    const preview = previewRestaurantTableSeed(buildSeedInput({ count: 3 }), [
      buildExistingTable('M02'),
    ]);
    expect(preview.creatable).toEqual(['M01', 'M03']);
    expect(preview.duplicates).toEqual(['M02']);
  });

  test('matches duplicates case-insensitively and ignores inactive tables', () => {
    const preview = previewRestaurantTableSeed(buildSeedInput({ type: 'VIP', prefix: 'vip ', count: 2, digits: 1 }), [
      buildExistingTable('VIP 1'),
      buildExistingTable('VIP 2', false),
    ]);
    expect(preview.duplicates).toEqual(['vip 1']);
    expect(preview.creatable).toEqual(['vip 2']);
  });

  test('reports an empty creatable list when every generated name is taken', () => {
    const preview = previewRestaurantTableSeed(buildSeedInput({ count: 2 }), [
      buildExistingTable('M01'),
      buildExistingTable('M02'),
    ]);
    expect(preview.creatable).toEqual([]);
    expect(preview.duplicates).toEqual(['M01', 'M02']);
  });
});
