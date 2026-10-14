import Dexie from 'dexie';
import { Alert, Drawer, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useLiveQuery } from 'dexie-react-hooks';
import { useI18n } from '@/hooks/useI18n';
import type { TranslationKey } from '@/i18n/messages';
import { db } from '@/lib/db';
import type { Membership, MembershipPointTransaction, MembershipPointTransactionType } from '@/types';
import { formatCurrency, formatDate } from '@/utils/formatters';

const { Text } = Typography;

const HISTORY_LIMIT = 200;

const TYPE_COLORS: Record<MembershipPointTransactionType, string> = {
  EARN: 'green',
  REDEEM: 'blue',
  VOID_EARN_REVERSAL: 'red',
  VOID_REDEEM_REVERSAL: 'orange',
  ADJUSTMENT: 'purple',
};

const TYPE_LABEL_KEYS: Record<MembershipPointTransactionType, TranslationKey> = {
  EARN: 'members.history.types.EARN',
  REDEEM: 'members.history.types.REDEEM',
  VOID_EARN_REVERSAL: 'members.history.types.VOID_EARN_REVERSAL',
  VOID_REDEEM_REVERSAL: 'members.history.types.VOID_REDEEM_REVERSAL',
  ADJUSTMENT: 'members.history.types.ADJUSTMENT',
};

interface MembershipPointHistoryDrawerProps {
  membership: Membership | null;
  onClose: () => void;
}

export default function MembershipPointHistoryDrawer({ membership: selectedMembership, onClose }: MembershipPointHistoryDrawerProps) {
  const { t } = useI18n();
  const membershipId = selectedMembership?.id;
  // Live, so a sale or sync while the drawer is open updates the balance shown.
  const liveMembership = useLiveQuery(
    async () => (membershipId ? db.memberships.get(membershipId) : undefined),
    [membershipId],
  );
  const membership = selectedMembership ? (liveMembership ?? selectedMembership) : null;
  const entries = useLiveQuery(
    async (): Promise<MembershipPointTransaction[]> => (membershipId
      ? db.membershipPointTransactions
        .where('[membership_id+created_at]')
        .between([membershipId, Dexie.minKey], [membershipId, Dexie.maxKey])
        .reverse()
        .limit(HISTORY_LIMIT)
        .toArray()
      : []),
    [membershipId],
  );
  const hasUnsyncedEntries = (entries ?? []).some((entry) => (
    entry.sync_status === 'pending' || entry.sync_status === 'failed'
  ));

  const columns: ColumnsType<MembershipPointTransaction> = [
    {
      title: t('members.history.date'),
      dataIndex: 'created_at',
      key: 'created_at',
      render: (createdAt: string) => formatDate(createdAt),
    },
    {
      title: t('members.history.type'),
      dataIndex: 'type',
      key: 'type',
      render: (type: MembershipPointTransactionType) => (
        <Tag color={TYPE_COLORS[type]} className="m-0">{t(TYPE_LABEL_KEYS[type])}</Tag>
      ),
    },
    {
      title: t('members.history.points'),
      dataIndex: 'points_delta',
      key: 'points_delta',
      align: 'right',
      render: (points: number) => (
        <Text strong type={points < 0 ? 'danger' : 'success'}>
          {points > 0 ? '+' : ''}{formatCurrency(points)}
        </Text>
      ),
    },
    {
      title: t('members.history.reference'),
      key: 'reference',
      render: (_value: unknown, entry) => (
        <div className="min-w-0">
          <div className="text-xs text-gray-700">{entry.transaction_number ?? '-'}</div>
          <div className="text-xs text-gray-500">{entry.created_by_name ?? '-'}</div>
        </div>
      ),
    },
    {
      title: t('members.history.sync'),
      key: 'sync',
      render: (_value: unknown, entry) => {
        if (entry.sync_status === 'pending') return <Tag color="gold" className="m-0">{t('members.history.syncPending')}</Tag>;
        if (entry.sync_status === 'failed') {
          return <Tag color="red" className="m-0" title={entry.sync_error}>{t('members.history.syncFailed')}</Tag>;
        }
        return <Text type="secondary" className="text-xs">{t('members.history.syncDone')}</Text>;
      },
    },
  ];

  return (
    <Drawer
      title={membership
        ? t('members.history.title', { name: membership.name ?? membership.phone })
        : t('members.history.open')}
      open={Boolean(membership)}
      onClose={onClose}
      width={720}
      destroyOnHidden
    >
      {membership && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
            <span className="text-sm text-gray-600">{t('members.history.balance')}</span>
            <Text strong type={membership.points_balance < 0 ? 'danger' : undefined} className="text-lg">
              {formatCurrency(membership.points_balance ?? 0)}
            </Text>
          </div>
          {membership.points_balance < 0 && (
            <Alert type="warning" showIcon title={t('members.history.negativeBalance')} />
          )}
          {hasUnsyncedEntries && (
            <Alert type="info" showIcon title={t('members.history.unsyncedNotice')} />
          )}
          <Table
            dataSource={entries ?? []}
            columns={columns}
            loading={entries === undefined}
            rowKey="id"
            size="small"
            pagination={{ pageSize: 20 }}
            scroll={{ x: true }}
            expandable={{
              expandedRowRender: (entry) => <p className="m-0 text-xs text-gray-600">{entry.reason}</p>,
            }}
            locale={{ emptyText: t('members.history.empty') }}
          />
          <p className="text-xs text-gray-500">{t('members.history.footnote', { limit: HISTORY_LIMIT })}</p>
        </div>
      )}
    </Drawer>
  );
}
