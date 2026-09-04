import { describe, expect, test } from 'bun:test';
import { createTableMultiSorter } from '../../src/utils/tableSorting';

interface ExampleRow {
  name: string;
  amount: number;
}

describe('createTableMultiSorter', () => {
  test('membentuk konfigurasi sorter Ant Design yang reusable dengan prioritas multiple', () => {
    const sorter = createTableMultiSorter<ExampleRow>(
      20,
      (first, second) => first.amount - second.amount || first.name.localeCompare(second.name),
    );
    const rows: ExampleRow[] = [
      { name: 'B', amount: 100 },
      { name: 'C', amount: 50 },
      { name: 'A', amount: 100 },
    ];

    expect(sorter.multiple).toBe(20);
    expect([...rows].sort(sorter.compare)).toEqual([
      { name: 'C', amount: 50 },
      { name: 'A', amount: 100 },
      { name: 'B', amount: 100 },
    ]);
  });
});
