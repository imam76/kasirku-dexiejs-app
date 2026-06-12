import { Button, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { Download, Lock, Upload } from 'lucide-react';
import type { CooperativeFieldCashSession } from '@/types';
import { formatCurrency, formatDate } from '@/utils/formatters';

const { Text } = Typography;

interface CooperativeFieldCashSessionTableProps {
  sessions: CooperativeFieldCashSession[];
  loading?: boolean;
  canManage: boolean;
  onDropping: (session: CooperativeFieldCashSession) => void;
  onDeposit: (session: CooperativeFieldCashSession) => void;
  onClose: (session: CooperativeFieldCashSession) => void;
}

export default function CooperativeFieldCashSessionTable({
  sessions,
  loading,
  canManage,
  onDropping,
  onDeposit,
  onClose,
}: CooperativeFieldCashSessionTableProps) {
  const columns: ColumnsType<CooperativeFieldCashSession> = [
    {
      title: 'Sesi',
      key: 'session',
      render: (_value: unknown, session) => (
        <Space orientation="vertical" size={0}>
          <Text strong>{session.session_number}</Text>
          <Text type="secondary">{formatDate(session.opened_at)}</Text>
        </Space>
      ),
    },
    {
      title: 'Petugas',
      key: 'employee',
      render: (_value: unknown, session) => (
        <Space orientation="vertical" size={0}>
          <Text>{session.employee_name}</Text>
          <Text type="secondary">{session.employee_position || '-'}</Text>
        </Space>
      ),
    },
    {
      title: 'Akun Kas',
      key: 'cash_account',
      render: (_value: unknown, session) => (
        <Space orientation="vertical" size={0}>
          <Text>{session.cash_account_name}</Text>
          <Text type="secondary">{session.cash_account_code}</Text>
        </Space>
      ),
    },
    {
      title: 'Saldo Awal',
      dataIndex: 'opening_cash_amount',
      key: 'opening_cash_amount',
      align: 'right',
      render: (amount: number) => `Rp ${formatCurrency(amount)}`,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status: CooperativeFieldCashSession['status'], session) => (
        <Space wrap>
          <Tag color={status === 'OPEN' ? 'green' : 'default'}>{status}</Tag>
          {session.balance_status && (
            <Tag color={session.balance_status === 'BALANCED' ? 'blue' : 'red'}>
              {session.balance_status}
            </Tag>
          )}
        </Space>
      ),
    },
    {
      title: 'Action',
      key: 'action',
      render: (_value: unknown, session) => (
        session.status === 'OPEN' && canManage ? (
          <Space wrap>
            <Button icon={<Download size={16} />} onClick={() => onDropping(session)}>
              Dropping
            </Button>
            <Button icon={<Upload size={16} />} onClick={() => onDeposit(session)}>
              Setor
            </Button>
            <Button icon={<Lock size={16} />} onClick={() => onClose(session)}>
              Tutup
            </Button>
          </Space>
        ) : '-'
      ),
    },
  ];

  return (
    <Table
      dataSource={sessions}
      columns={columns}
      rowKey="id"
      loading={loading}
      pagination={{ pageSize: 8 }}
      scroll={{ x: true }}
      locale={{ emptyText: 'Belum ada sesi kas petugas.' }}
    />
  );
}
