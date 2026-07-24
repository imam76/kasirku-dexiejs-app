import { useEffect, useMemo, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  App,
  Button,
  Card,
  Col,
  Empty,
  Input,
  Result,
  Row,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { ExternalLink, Link2, RefreshCw, Search, Store } from 'lucide-react';
import { useAuth } from '@/auth/useAuth';
import dayjs from '@/lib/dayjs';
import {
  marketplaceAdapter,
  marketplaceErrorMessage,
  type MarketplaceAccountDto,
  type MarketplaceInternalStatus,
  type MarketplaceOrderDto,
  type ShopeeAuthorizationAttemptDto,
} from '@/services/marketplaceAdapter';
import { isTauriRuntime } from '@/utils/export/platform';
import {
  AccountStatusTag,
  InternalStatusTag,
} from './marketplaceFormatters';
import { formatMarketplaceMoney } from '@/utils/marketplace';

const { Text, Title } = Typography;
const PAGE_SIZE = 20;

const STATUS_OPTIONS: Array<{ value: MarketplaceInternalStatus; label: string }> = [
  { value: 'WAITING_PAYMENT', label: 'Menunggu Pembayaran' },
  { value: 'READY_TO_PROCESS', label: 'Siap Diproses' },
  { value: 'SHIPPED', label: 'Dikirim' },
  { value: 'COMPLETED', label: 'Selesai' },
  { value: 'CANCELLED', label: 'Dibatalkan' },
];

export default function MarketplaceShopeeManagement() {
  const desktop = isTauriRuntime();
  const { message } = App.useApp();
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const canManage = can('MARKETPLACE_MANAGE');
  const [selectedAccountId, setSelectedAccountId] = useState<string>();
  const [search, setSearch] = useState('');
  const [internalStatus, setInternalStatus] = useState<MarketplaceInternalStatus>();
  const [page, setPage] = useState(1);
  const [authorizationAttempt, setAuthorizationAttempt] =
    useState<ShopeeAuthorizationAttemptDto>();
  const [localError, setLocalError] = useState<string>();

  const accountsQuery = useQuery({
    queryKey: ['marketplace', 'accounts'],
    queryFn: marketplaceAdapter.listAccounts,
    enabled: desktop,
  });

  const activeAccountId = selectedAccountId ?? accountsQuery.data?.[0]?.id;

  const ordersQuery = useQuery({
    queryKey: [
      'marketplace',
      'orders',
      activeAccountId,
      search,
      internalStatus,
      page,
    ],
    queryFn: () => marketplaceAdapter.listOrders({
      accountId: activeAccountId,
      search: search.trim() || undefined,
      internalStatus,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    }),
    enabled: desktop && Boolean(activeAccountId),
  });

  const logsQuery = useQuery({
    queryKey: ['marketplace', 'logs', activeAccountId],
    queryFn: () => marketplaceAdapter.listIntegrationLogs(activeAccountId, 20),
    enabled: desktop && Boolean(activeAccountId),
  });

  const connectMutation = useMutation({
    mutationFn: marketplaceAdapter.startShopeeAuthorization,
    onMutate: () => setLocalError(undefined),
    onSuccess: (attempt) => {
      setAuthorizationAttempt(attempt);
      message.info('Browser dibuka. Selesaikan otorisasi menggunakan akun toko Shopee.');
    },
    onError: (error) => setLocalError(marketplaceErrorMessage(error)),
  });

  useEffect(() => {
    if (!authorizationAttempt || authorizationAttempt.status !== 'PENDING') return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const poll = async () => {
      try {
        const next = await marketplaceAdapter.getShopeeAuthorizationStatus(
          authorizationAttempt.attempt_id,
        );
        if (disposed) return;
        setAuthorizationAttempt(next);
        if (next.status === 'PENDING') {
          timer = setTimeout(poll, 2_000);
          return;
        }
        if (next.status === 'SUCCEEDED') {
          message.success(next.message ?? 'Toko Shopee berhasil dihubungkan.');
          if (next.marketplace_account_id) setSelectedAccountId(next.marketplace_account_id);
          await queryClient.invalidateQueries({ queryKey: ['marketplace'] });
        } else {
          setLocalError(next.message ?? 'Otorisasi Shopee tidak berhasil.');
        }
      } catch (error) {
        if (!disposed) setLocalError(marketplaceErrorMessage(error));
      }
    };

    timer = setTimeout(poll, 1_000);
    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
    };
  }, [authorizationAttempt, message, queryClient]);

  const syncMutation = useMutation({
    mutationFn: marketplaceAdapter.syncOrders,
    onMutate: () => setLocalError(undefined),
    onSuccess: async (summary) => {
      message.success(
        `${summary.upserted_orders} pesanan dan ${summary.upserted_items} item berhasil disinkronkan.`,
      );
      await queryClient.invalidateQueries({ queryKey: ['marketplace'] });
    },
    onError: async (error) => {
      setLocalError(marketplaceErrorMessage(error));
      await queryClient.invalidateQueries({ queryKey: ['marketplace', 'logs'] });
    },
  });

  const selectedAccount = accountsQuery.data?.find(
    (account) => account.id === activeAccountId,
  );
  const latestLog = logsQuery.data?.[0];
  const latestFailedLog = latestLog?.status === 'FAILED' ? latestLog : undefined;
  const visibleError = localError
    ?? (accountsQuery.error ? marketplaceErrorMessage(accountsQuery.error) : undefined)
    ?? (ordersQuery.error ? marketplaceErrorMessage(ordersQuery.error) : undefined)
    ?? latestFailedLog?.error_message
    ?? undefined;

  const columns = useMemo<ColumnsType<MarketplaceOrderDto>>(() => [
    {
      title: 'Pesanan',
      dataIndex: 'order_sn',
      key: 'order_sn',
      render: (orderSn: string, row) => (
        <Space direction="vertical" size={0}>
          <Link
            to="/marketplace/shopee/orders/$orderId"
            params={{ orderId: row.id }}
            className="font-semibold"
          >
            {orderSn} <ExternalLink size={12} className="inline" />
          </Link>
          <Text type="secondary" className="text-xs">{row.buyer_username ?? 'Buyer tidak tersedia'}</Text>
        </Space>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'internal_status',
      key: 'internal_status',
      render: (status: MarketplaceInternalStatus, row) => (
        <Space direction="vertical" size={2}>
          <InternalStatusTag status={status} />
          <Text type="secondary" className="text-xs">Shopee: {row.marketplace_status}</Text>
        </Space>
      ),
    },
    {
      title: 'Total',
      dataIndex: 'total_amount',
      key: 'total_amount',
      align: 'right',
      render: (amount: string | null, row) => formatMarketplaceMoney(amount, row.currency),
    },
    {
      title: 'Waktu Pesanan',
      dataIndex: 'order_created_at',
      key: 'order_created_at',
      render: (value: string) => dayjs(value).format('DD MMM YYYY HH:mm'),
    },
  ], []);

  if (!desktop) {
    return (
      <Result
        status="info"
        title="Marketplace hanya tersedia di aplikasi desktop"
        subTitle="OAuth, token, sinkronisasi, dan penyimpanan pesanan dijalankan oleh backend Rust pada Frayukti Desktop."
      />
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <Title level={2} style={{ marginBottom: 4 }}>Marketplace · Shopee</Title>
          <Text type="secondary">Hubungkan toko dan sinkronkan pesanan secara manual.</Text>
        </div>
        {canManage && (
          <Button
            type="primary"
            icon={<Link2 size={16} />}
            loading={connectMutation.isPending || authorizationAttempt?.status === 'PENDING'}
            onClick={() => connectMutation.mutate()}
          >
            Hubungkan Toko Shopee
          </Button>
        )}
      </div>

      {authorizationAttempt?.status === 'PENDING' && (
        <Alert
          type="info"
          showIcon
          title="Menunggu otorisasi Shopee"
          description={authorizationAttempt.message}
        />
      )}
      {visibleError && (
        <Alert
          type="error"
          showIcon
          closable
          title="Integrasi Shopee mengalami kendala"
          description={(
            <Space direction="vertical" size={2}>
              <span>{visibleError}</span>
              {latestFailedLog && (
                <Text type="secondary" className="text-xs">
                  Referensi log: {latestFailedLog.id} · {dayjs(latestFailedLog.created_at).format('DD MMM YYYY HH:mm:ss')}
                </Text>
              )}
            </Space>
          )}
          onClose={() => setLocalError(undefined)}
        />
      )}

      <Card title="Koneksi Toko" loading={accountsQuery.isLoading}>
        {!accountsQuery.data?.length ? (
          <Empty
            image={<Store size={52} className="mx-auto text-gray-300" />}
            description="Belum ada toko Shopee yang terhubung."
          />
        ) : (
          <Row gutter={[12, 12]}>
            {accountsQuery.data.map((account: MarketplaceAccountDto) => {
              const selected = account.id === activeAccountId;
              const syncing = syncMutation.isPending
                && syncMutation.variables === account.id;
              return (
                <Col xs={24} md={12} xl={8} key={account.id}>
                  <Card
                    size="small"
                    hoverable
                    onClick={() => {
                      setSelectedAccountId(account.id);
                      setPage(1);
                    }}
                    style={{ borderColor: selected ? '#1677ff' : undefined }}
                  >
                    <Space direction="vertical" className="w-full" size={10}>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <Text strong>{account.shop_name}</Text>
                          <div><Text type="secondary">Shop ID: {account.shop_id}</Text></div>
                        </div>
                        <AccountStatusTag status={account.status} />
                      </div>
                      <Text type="secondary" className="text-xs">
                        Sinkronisasi terakhir: {account.last_synced_at
                          ? dayjs(account.last_synced_at).format('DD MMM YYYY HH:mm:ss')
                          : 'Belum pernah'}
                      </Text>
                      {canManage && account.status === 'CONNECTED' && (
                        <Button
                          icon={<RefreshCw size={14} />}
                          loading={syncing}
                          disabled={syncMutation.isPending && !syncing}
                          onClick={(event) => {
                            event.stopPropagation();
                            syncMutation.mutate(account.id);
                          }}
                        >
                          Sinkronkan Pesanan
                        </Button>
                      )}
                      {canManage && account.status === 'REAUTH_REQUIRED' && (
                        <Button
                          danger
                          icon={<Link2 size={14} />}
                          loading={connectMutation.isPending}
                          onClick={(event) => {
                            event.stopPropagation();
                            connectMutation.mutate();
                          }}
                        >
                          Hubungkan Ulang
                        </Button>
                      )}
                    </Space>
                  </Card>
                </Col>
              );
            })}
          </Row>
        )}
      </Card>

      <Card
        title={selectedAccount ? `Pesanan · ${selectedAccount.shop_name}` : 'Pesanan Shopee'}
        extra={ordersQuery.isFetching ? <Spin size="small" /> : undefined}
      >
        <div className="flex flex-col gap-3 md:flex-row mb-4">
          <Input
            allowClear
            prefix={<Search size={15} />}
            placeholder="Cari order SN atau buyer..."
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            style={{ maxWidth: 360 }}
          />
          <Select
            allowClear
            placeholder="Semua status"
            value={internalStatus}
            options={STATUS_OPTIONS}
            onChange={(value) => {
              setInternalStatus(value);
              setPage(1);
            }}
            style={{ minWidth: 220 }}
          />
          {selectedAccount && <Tag color="orange">Shopee</Tag>}
        </div>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={ordersQuery.data?.rows ?? []}
          loading={ordersQuery.isLoading}
          scroll={{ x: 760 }}
          pagination={{
            current: page,
            pageSize: PAGE_SIZE,
            total: ordersQuery.data?.total ?? 0,
            showSizeChanger: false,
            showTotal: (total) => `${total} pesanan`,
            onChange: setPage,
          }}
          locale={{ emptyText: activeAccountId ? 'Belum ada pesanan tersinkron.' : 'Pilih toko terlebih dahulu.' }}
        />
      </Card>
    </div>
  );
}
