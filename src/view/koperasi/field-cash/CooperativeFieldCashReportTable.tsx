import { Button, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { Download, Lock, Unlock, Upload } from 'lucide-react';
import type { CooperativeFieldCashReportRow } from '@/services/cooperativeFieldCashReportService';
import type { CooperativeFieldCashSession } from '@/types';
import { formatCurrency, formatDate } from '@/utils/formatters';

const { Text } = Typography;

interface CooperativeFieldCashReportTableProps {
  rows: CooperativeFieldCashReportRow[];
  loading?: boolean;
  canManage?: boolean;
  openSessions?: Map<string, CooperativeFieldCashSession>;
  onDropping?: (row: CooperativeFieldCashReportRow) => void;
  onDeposit?: (row: CooperativeFieldCashReportRow) => void;
  onOpenSession?: (row: CooperativeFieldCashReportRow) => void;
  onCloseSession?: (row: CooperativeFieldCashReportRow) => void;
}

const money = (amount?: number) => `Rp ${formatCurrency(Number(amount || 0))}`;

export default function CooperativeFieldCashReportTable({
  rows,
  loading,
  canManage = false,
  openSessions,
  onDropping,
  onDeposit,
  onOpenSession,
  onCloseSession,
}: CooperativeFieldCashReportTableProps) {
  const columns: ColumnsType<CooperativeFieldCashReportRow> = [
    {
      title: 'Kolektor',
      key: 'employee',
      fixed: 'left',
      width: 220,
      render: (_value: unknown, row) => (
        <Space orientation="vertical" size={0}>
          <Text strong>{row.employee_name}</Text>
          <Text type="secondary">{row.employee_position || '-'}</Text>
        </Space>
      ),
    },
    {
      title: 'Akun Kas Petugas',
      key: 'cash_account',
      width: 240,
      render: (_value: unknown, row) => (
        <Space orientation="vertical" size={0}>
          <Text>{row.cash_account_name}</Text>
          <Text type="secondary">{row.cash_account_code}</Text>
        </Space>
      ),
    },
    {
      title: 'Saldo Belum Disetor',
      dataIndex: 'balance_amount',
      key: 'balance_amount',
      align: 'right',
      width: 170,
      render: (amount: number) => (
        <Space direction="vertical" size={0} align="end">
          <Text strong={Math.abs(amount) > 0.01}>{money(amount)}</Text>
          <Tag color={Math.abs(amount) > 0.01 ? 'orange' : 'green'}>
            {Math.abs(amount) > 0.01 ? 'Belum disetor' : 'Nol'}
          </Tag>
        </Space>
      ),
    },
    {
      title: 'Angsuran Masuk',
      dataIndex: 'storting_loan_payment_amount',
      key: 'storting_loan_payment_amount',
      align: 'right',
      width: 150,
      render: money,
    },
    {
      title: 'Simpanan Masuk',
      dataIndex: 'storting_saving_deposit_amount',
      key: 'storting_saving_deposit_amount',
      align: 'right',
      width: 150,
      render: money,
    },
    {
      title: 'Total Masuk',
      dataIndex: 'total_storting_amount',
      key: 'total_storting_amount',
      align: 'right',
      width: 140,
      render: money,
    },
    {
      title: 'Sudah Setor',
      dataIndex: 'deposit_to_finance_amount',
      key: 'deposit_to_finance_amount',
      align: 'right',
      width: 140,
      render: money,
    },
    {
      title: 'Dropping',
      dataIndex: 'dropping_from_finance_amount',
      key: 'dropping_from_finance_amount',
      align: 'right',
      width: 130,
      render: money,
    },
    {
      title: 'Pencairan',
      dataIndex: 'loan_disbursement_amount',
      key: 'loan_disbursement_amount',
      align: 'right',
      width: 130,
      render: money,
    },
    {
      title: 'Penarikan',
      dataIndex: 'saving_withdrawal_amount',
      key: 'saving_withdrawal_amount',
      align: 'right',
      width: 130,
      render: money,
    },
    {
      title: 'IPTW',
      dataIndex: 'iptw_payout_amount',
      key: 'iptw_payout_amount',
      align: 'right',
      width: 130,
      render: money,
    },
    {
      title: 'Terakhir',
      dataIndex: 'last_movement_at',
      key: 'last_movement_at',
      width: 160,
      render: (date?: string) => date ? formatDate(date) : '-',
    },
    {
      title: 'Sesi Kas',
      key: 'session',
      width: 180,
      render: (_value: unknown, row) => {
        const session = openSessions?.get(row.employee_id);
        if (!session) {
          return <Tag>Belum buka</Tag>;
        }
        return (
          <Space orientation="vertical" size={0}>
            <Tag color="blue">{session.session_number}</Tag>
            <Text type="secondary">OPEN sejak {formatDate(session.opened_at)}</Text>
          </Space>
        );
      },
    },
    ...(canManage ? [{
      title: 'Action',
      key: 'action',
      fixed: 'right' as const,
      width: 280,
      render: (_value: unknown, row: CooperativeFieldCashReportRow) => {
        const hasOpenSession = Boolean(openSessions?.get(row.employee_id));
        if (!hasOpenSession) {
          return (
            <Button type="primary" icon={<Unlock size={16} />} onClick={() => onOpenSession?.(row)}>
              Buka Sesi
            </Button>
          );
        }
        return (
          <Space wrap>
            <Button icon={<Download size={16} />} onClick={() => onDropping?.(row)}>
              Dropping
            </Button>
            <Button icon={<Upload size={16} />} onClick={() => onDeposit?.(row)}>
              Setor
            </Button>
            <Button danger icon={<Lock size={16} />} onClick={() => onCloseSession?.(row)}>
              Tutup Sesi
            </Button>
          </Space>
        );
      },
    }] : []),
  ];

  return (
    <Table
      dataSource={rows}
      columns={columns}
      rowKey="employee_id"
      loading={loading}
      pagination={{ pageSize: 8 }}
      scroll={{ x: canManage ? 2080 : 1800 }}
      locale={{ emptyText: 'Belum ada akun kas kolektor.' }}
    />
  );
}
