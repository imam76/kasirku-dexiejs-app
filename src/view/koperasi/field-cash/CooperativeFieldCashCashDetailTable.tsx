import { Alert, Empty, Space, Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type {
  CooperativeCashReportEmployee,
  CooperativeCashReportRowKey,
} from '@/services/cooperativeCashReportService';
import { formatCurrency } from '@/utils/formatters';

const { Text } = Typography;

interface CooperativeFieldCashCashDetailTableProps {
  employees: CooperativeCashReportEmployee[];
  loading?: boolean;
  title?: string;
  subtitle?: string;
  compact?: boolean;
  emptyText?: string;
  error?: unknown;
}

interface CashDetailRow {
  key: string;
  employee_id: string;
  employee_name: string;
  employee_code: string;
  employee_position?: string;
  description: string;
  incoming_amount: number;
  outgoing_amount: number;
  balance_amount?: number;
  is_total?: boolean;
}

const rowLabels: Record<CooperativeCashReportRowKey, string> = {
  STORTING: 'STORTING',
  DROP: 'DROP',
  TABUNGAN: 'TABUNGAN',
  IPTW: 'IPTW',
};

const money = (amount?: number) => `Rp ${formatCurrency(Number(amount || 0))}`;

const getErrorMessage = (error: unknown) => (
  error instanceof Error ? error.message : 'Rincian laporan tunai gagal dimuat.'
);

const buildRows = (employees: CooperativeCashReportEmployee[]): CashDetailRow[] => (
  employees.flatMap((employee) => [
    ...employee.rows.map((row) => ({
      key: `${employee.employee_id}-${row.key}`,
      employee_id: employee.employee_id,
      employee_name: employee.employee_name,
      employee_code: employee.employee_code,
      employee_position: employee.employee_position,
      description: rowLabels[row.key],
      incoming_amount: row.incoming_amount,
      outgoing_amount: row.outgoing_amount,
    })),
    {
      key: `${employee.employee_id}-TOTAL`,
      employee_id: employee.employee_id,
      employee_name: employee.employee_name,
      employee_code: employee.employee_code,
      employee_position: employee.employee_position,
      description: 'JUMLAH',
      incoming_amount: employee.total_incoming_amount,
      outgoing_amount: employee.total_outgoing_amount,
      balance_amount: employee.total_balance_amount,
      is_total: true,
    },
  ])
);

export default function CooperativeFieldCashCashDetailTable({
  employees,
  loading = false,
  title = 'Rincian Laporan Tunai',
  subtitle,
  compact = false,
  emptyText = 'Belum ada rincian laporan tunai untuk filter ini.',
  error,
}: CooperativeFieldCashCashDetailTableProps) {
  const rows = buildRows(employees);
  const showEmployeeColumn = !compact || employees.length > 1;
  const summary = employees.reduce((result, employee) => ({
    incoming: result.incoming + employee.total_incoming_amount,
    outgoing: result.outgoing + employee.total_outgoing_amount,
    balance: result.balance + employee.total_balance_amount,
  }), { incoming: 0, outgoing: 0, balance: 0 });
  const columns: ColumnsType<CashDetailRow> = [
    ...(showEmployeeColumn ? [{
      title: 'Kolektor',
      key: 'employee',
      width: 220,
      render: (_value: unknown, row: CashDetailRow) => (
        <Space direction="vertical" size={0}>
          <Text strong={row.is_total}>{row.employee_name}</Text>
          <Text type="secondary">
            {row.employee_code || '-'}{row.employee_position ? ` - ${row.employee_position}` : ''}
          </Text>
        </Space>
      ),
    }] : []),
    {
      title: 'Keterangan',
      dataIndex: 'description',
      key: 'description',
      width: 150,
      render: (value: string, row) => (
        <Text strong={row.is_total}>{value}</Text>
      ),
    },
    {
      title: 'Masuk',
      dataIndex: 'incoming_amount',
      key: 'incoming_amount',
      align: 'right',
      width: 140,
      render: (amount: number, row) => (
        <Text strong={row.is_total}>{money(amount)}</Text>
      ),
    },
    {
      title: 'Keluar',
      dataIndex: 'outgoing_amount',
      key: 'outgoing_amount',
      align: 'right',
      width: 140,
      render: (amount: number, row) => (
        <Text strong={row.is_total}>{money(amount)}</Text>
      ),
    },
    {
      title: 'Saldo',
      dataIndex: 'balance_amount',
      key: 'balance_amount',
      align: 'right',
      width: 140,
      render: (amount?: number, row?: CashDetailRow) => (
        row?.is_total ? <Text strong>{money(amount)}</Text> : <Text type="secondary">-</Text>
      ),
    },
  ];

  return (
    <div className={compact ? '' : 'mt-4 rounded-md border border-gray-100 p-3'}>
      <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <Space direction="vertical" size={0}>
          <Text strong>{title}</Text>
          {subtitle ? <Text type="secondary">{subtitle}</Text> : null}
        </Space>
        <div className="grid grid-cols-3 gap-2 text-right">
          <div className="rounded-md border border-gray-100 px-3 py-2">
            <p className="text-xs text-gray-500">Masuk</p>
            <p className="font-semibold text-gray-800">{money(summary.incoming)}</p>
          </div>
          <div className="rounded-md border border-gray-100 px-3 py-2">
            <p className="text-xs text-gray-500">Keluar</p>
            <p className="font-semibold text-gray-800">{money(summary.outgoing)}</p>
          </div>
          <div className="rounded-md border border-gray-100 px-3 py-2">
            <p className="text-xs text-gray-500">Saldo</p>
            <p className="font-semibold text-gray-800">{money(summary.balance)}</p>
          </div>
        </div>
      </div>

      {error ? (
        <Alert
          className="mb-3"
          type="error"
          showIcon
          message={getErrorMessage(error)}
        />
      ) : null}

      {!loading && !rows.length ? (
        <Empty description={emptyText} />
      ) : (
        <Table<CashDetailRow>
          size="small"
          dataSource={rows}
          columns={columns}
          rowKey="key"
          loading={loading}
          pagination={compact || rows.length <= 24 ? false : { pageSize: 24, hideOnSinglePage: true }}
          rowClassName={(row) => (row.is_total ? 'bg-gray-50 font-semibold' : '')}
          scroll={{ x: showEmployeeColumn ? 790 : 570 }}
        />
      )}
    </div>
  );
}
