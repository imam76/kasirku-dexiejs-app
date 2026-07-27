import { Card, Empty, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { ClipboardList } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { getActivityLogs } from '@/auth/authService';
import { ROLE_LABEL } from '@/auth/permissions';
import dayjs from '@/lib/dayjs';
import type { ActivityLog, UserRole } from '@/types';

const { Text } = Typography;

const actionColor = (action: string) => {
  if (action.includes('VOID') || action.includes('DISABLED')) return 'red';
  if (action.includes('LOGIN') || action.includes('CREATED') || action.includes('ENABLED')) return 'green';
  if (action.includes('PIN') || action.includes('UPDATED')) return 'blue';
  return 'default';
};

const formatChangeValue = (value: string | number | boolean | null | undefined) => {
  if (value === undefined || value === null || value === '') return '-';
  if (typeof value === 'boolean') return value ? 'Ya' : 'Tidak';
  return String(value);
};

export const ActivityLogViewer = () => {
  const logs = useLiveQuery(
    () => getActivityLogs({ limit: 200 }),
    [],
    [],
  );

  const columns: ColumnsType<ActivityLog> = [
    {
      title: 'Waktu',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 180,
      render: (createdAt: string) => dayjs(createdAt).tz().format('DD MMM YYYY, HH:mm'),
    },
    {
      title: 'User',
      key: 'user',
      width: 180,
      render: (_value: unknown, log) => (
        <Space orientation="vertical" size={0}>
          <Text strong>{log.user_name ?? '-'}</Text>
          {log.role && <Text type="secondary">{ROLE_LABEL[log.role as UserRole]}</Text>}
        </Space>
      ),
    },
    {
      title: 'Aksi',
      dataIndex: 'action',
      key: 'action',
      width: 190,
      render: (action: string) => <Tag color={actionColor(action)}>{action}</Tag>,
    },
    {
      title: 'Data',
      key: 'entity',
      width: 180,
      render: (_value: unknown, log) => (
        <Space orientation="vertical" size={0}>
          <Text>{log.entity}</Text>
          {log.entity_id && <Text type="secondary">{log.entity_id}</Text>}
        </Space>
      ),
    },
    {
      title: 'Keterangan',
      dataIndex: 'description',
      key: 'description',
    },
    {
      title: 'Perubahan penting',
      key: 'changes',
      width: 320,
      render: (_value: unknown, log) => log.changes?.length ? (
        <Space orientation="vertical" size={2}>
          {log.changes.map((change, index) => (
            <Text key={`${change.field}-${index}`} className="text-xs">
              <Text code>{change.field}</Text>
              {' '}
              {formatChangeValue(change.before)}
              {' → '}
              {formatChangeValue(change.after)}
            </Text>
          ))}
        </Space>
      ) : <Text type="secondary">-</Text>,
    },
  ];

  return (
    <Card
      className="shadow-md"
      title={(
        <div className="flex items-center gap-2">
          <ClipboardList className="h-5 w-5" />
          Activity Log
        </div>
      )}
    >
      <Table
        dataSource={logs}
        columns={columns}
        rowKey="id"
        pagination={{ pageSize: 10 }}
        scroll={{ x: true }}
        locale={{
          emptyText: (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="Belum ada activity log."
            />
          ),
        }}
      />
    </Card>
  );
};
