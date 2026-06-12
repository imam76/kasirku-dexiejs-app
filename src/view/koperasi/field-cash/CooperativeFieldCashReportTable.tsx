import { Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { CooperativeFieldCashReportRow } from '@/services/cooperativeFieldCashReportService';
import { formatCurrency, formatDate } from '@/utils/formatters';

const { Text } = Typography;

interface CooperativeFieldCashReportTableProps {
  rows: CooperativeFieldCashReportRow[];
  loading?: boolean;
}

const money = (amount?: number) => `Rp ${formatCurrency(Number(amount || 0))}`;

export default function CooperativeFieldCashReportTable({
  rows,
  loading,
}: CooperativeFieldCashReportTableProps) {
  const columns: ColumnsType<CooperativeFieldCashReportRow> = [
    {
      title: 'Petugas',
      key: 'employee',
      fixed: 'left',
      render: (_value: unknown, row) => (
        <Space orientation="vertical" size={0}>
          <Text strong>{row.employee_name}</Text>
          <Text type="secondary">{row.session_number}</Text>
        </Space>
      ),
    },
    {
      title: 'Tanggal',
      key: 'date',
      render: (_value: unknown, row) => (
        <Space orientation="vertical" size={0}>
          <Text>{formatDate(row.opened_at)}</Text>
          <Text type="secondary">{row.closed_at ? formatDate(row.closed_at) : '-'}</Text>
        </Space>
      ),
    },
    {
      title: 'Saldo Awal',
      dataIndex: 'opening_cash_amount',
      key: 'opening_cash_amount',
      align: 'right',
      render: money,
    },
    {
      title: 'Dropping Finance',
      dataIndex: 'dropping_from_finance_amount',
      key: 'dropping_from_finance_amount',
      align: 'right',
      render: money,
    },
    {
      title: 'Storting Angsuran',
      dataIndex: 'storting_loan_payment_amount',
      key: 'storting_loan_payment_amount',
      align: 'right',
      render: money,
    },
    {
      title: 'Storting Simpanan',
      dataIndex: 'storting_saving_deposit_amount',
      key: 'storting_saving_deposit_amount',
      align: 'right',
      render: money,
    },
    {
      title: 'Total Storting',
      dataIndex: 'total_storting_amount',
      key: 'total_storting_amount',
      align: 'right',
      render: money,
    },
    {
      title: 'Dropping Pinjaman',
      dataIndex: 'loan_disbursement_amount',
      key: 'loan_disbursement_amount',
      align: 'right',
      render: money,
    },
    {
      title: 'Penarikan Simpanan',
      dataIndex: 'saving_withdrawal_amount',
      key: 'saving_withdrawal_amount',
      align: 'right',
      render: money,
    },
    {
      title: 'Setor Finance',
      dataIndex: 'deposit_to_finance_amount',
      key: 'deposit_to_finance_amount',
      align: 'right',
      render: money,
    },
    {
      title: 'Saldo Akhir Sistem',
      dataIndex: 'expected_closing_cash_amount',
      key: 'expected_closing_cash_amount',
      align: 'right',
      render: money,
    },
    {
      title: 'Uang Fisik Akhir',
      dataIndex: 'closing_cash_amount',
      key: 'closing_cash_amount',
      align: 'right',
      render: money,
    },
    {
      title: 'Selisih',
      dataIndex: 'closing_difference_amount',
      key: 'closing_difference_amount',
      align: 'right',
      render: money,
    },
    {
      title: 'Status',
      key: 'status',
      render: (_value: unknown, row) => (
        <Space wrap>
          <Tag color={row.status === 'OPEN' ? 'green' : 'default'}>{row.status}</Tag>
          {row.balance_status && (
            <Tag color={row.balance_status === 'BALANCED' ? 'blue' : 'red'}>
              {row.balance_status}
            </Tag>
          )}
        </Space>
      ),
    },
  ];

  return (
    <Table
      dataSource={rows}
      columns={columns}
      rowKey="session_id"
      loading={loading}
      pagination={{ pageSize: 8 }}
      scroll={{ x: 1700 }}
      locale={{ emptyText: 'Belum ada rekap kas petugas.' }}
    />
  );
}
