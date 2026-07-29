import type { CompareFn } from 'antd/es/table/interface';

export interface TableMultiSorter<T> {
  compare: CompareFn<T>;
  multiple: number;
}

/**
 * Builds Ant Design's reusable multi-column sorter configuration.
 * A larger priority number is evaluated before a smaller one.
 */
export const createTableMultiSorter = <T>(
  priority: number,
  compare: CompareFn<T>,
): TableMultiSorter<T> => ({
  compare,
  multiple: priority,
});
