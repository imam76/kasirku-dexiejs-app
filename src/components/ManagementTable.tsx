import { Table } from 'antd';
import type { ColumnsType, TableProps } from 'antd/es/table';
import type { ReactNode } from 'react';

interface ManagementTableProps<T> {
  columns: ColumnsType<T>;
  dataSource: T[];
  rowKey?: TableProps<T>['rowKey'];
  loading?: boolean;
  emptyText?: ReactNode;
  scrollX?: number | string | true;
  pageSize?: number;
  pageSizeOptions?: string[];
  showTotal?: (total: number, range: [number, number]) => ReactNode;
  onRow?: TableProps<T>['onRow'];
  rowSelection?: TableProps<T>['rowSelection'];
}

/**
 * Satu titik panggil untuk semua tabel manajemen (Karyawan, COA, Produk, dst)
 * supaya rowKey, pagination, scroll, dan empty state tidak diketik ulang beda-beda
 * di tiap layar dan diam-diam berakhir tidak konsisten.
 */
export default function ManagementTable<T extends object>({
  columns,
  dataSource,
  rowKey = 'id',
  loading,
  emptyText,
  scrollX = 'max-content',
  pageSize = 10,
  pageSizeOptions = ['10', '20', '50', '100'],
  showTotal,
  onRow,
  rowSelection,
}: ManagementTableProps<T>) {
  return (
    <Table<T>
      rowKey={rowKey}
      columns={columns}
      dataSource={dataSource}
      loading={loading}
      onRow={onRow}
      rowSelection={rowSelection}
      scroll={{ x: scrollX }}
      pagination={{
        pageSize,
        showSizeChanger: true,
        pageSizeOptions,
        showTotal,
      }}
      locale={{ emptyText }}
    />
  );
}
