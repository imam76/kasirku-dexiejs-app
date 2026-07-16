import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { App, Alert, Button, Empty, Input, Segmented, Table, Tag, Tooltip } from 'antd';
import type { TableProps } from 'antd';
import {
  AlertTriangle,
  CheckCircle2,
  Cloud,
  CloudOff,
  DatabaseZap,
  ListRestart,
  RefreshCw,
  RotateCw,
  Search,
  type LucideIcon,
} from 'lucide-react';
import { useI18n } from '@/hooks/useI18n';
import { useSyncQueueDetails } from '@/hooks/useSyncQueueDetails';
import { useSyncStatus } from '@/hooks/useSyncStatus';
import dayjs from '@/lib/dayjs';
import { postgresAdapter, type PostgresHealth } from '@/services/postgresAdapter';
import { runDatabaseSyncNow, retryFailedDatabaseSyncItems } from '@/services/syncOrchestratorService';
import type { SyncQueueItem, SyncQueueStatus } from '@/types';

type ActiveQueueStatusFilter = 'all' | Extract<SyncQueueStatus, 'pending' | 'processing' | 'failed'>;

const activeStatusOptions: ActiveQueueStatusFilter[] = ['all', 'pending', 'processing', 'failed'];

const operationColor: Record<SyncQueueItem['operation'], string> = {
  create: 'green',
  update: 'blue',
  delete: 'red',
};

const statusColor: Record<SyncQueueStatus, string> = {
  pending: 'gold',
  processing: 'blue',
  synced: 'green',
  failed: 'red',
};

const entityLabelByName: Record<string, string> = {
  activityLogs: 'Log Aktivitas',
  authUsers: 'User',
  contacts: 'Kontak',
  cooperativeAreas: 'Area Koperasi',
  cooperativeLoanCollectionEvents: 'Histori Penagihan Koperasi',
  cooperativeLoanInstallments: 'Angsuran Koperasi',
  cooperativeLoanPayments: 'Pembayaran Koperasi',
  cooperativeLoans: 'Pinjaman Koperasi',
  cooperativeMemberSavingBalances: 'Saldo Simpanan',
  cooperativeMembers: 'Anggota Koperasi',
  cooperativeSavingTransactions: 'Simpanan Koperasi',
  currencies: 'Mata Uang',
  currencyRates: 'Kurs',
  departments: 'Department',
  financeTransactions: 'Transaksi Keuangan',
  accountingPeriods: 'Periode Akuntansi',
  accountingFiscalYears: 'Tahun Fiskal Akuntansi',
  closingRuns: 'Tutup Buku Periode',
  fiscalYearClosingRuns: 'Tutup Buku Tahun Fiskal',
  journalEntries: 'Jurnal',
  products: 'Produk',
  projects: 'Project',
  purchaseDocuments: 'Dokumen Pembelian',
  salesDocuments: 'Dokumen Sales',
  stockMutations: 'Mutasi Stok',
  taxes: 'Tax',
  warehouses: 'Gudang',
  paymentMethods: 'Metode Pembayaran',
};

const formatDateTime = (value?: string) => (
  value ? dayjs(value).format('DD MMM YYYY HH:mm:ss') : '-'
);

const getEntityLabel = (entity: string) => entityLabelByName[entity] ?? entity;

const getHealthTagColor = (health?: PostgresHealth) => {
  if (!health) return 'default';
  if (health.available) return 'green';
  if (health.status === 'unconfigured') return 'default';
  if (health.status === 'migration_failed') return 'orange';
  return 'red';
};

const panelClassName = 'rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-[#141829]';
const statCardClassName = 'rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition-colors dark:border-slate-800 dark:bg-[#141829]';

const SYNC_REFRESH_QUERY_KEYS = [
  'cooperativeFieldCashReport',
  'cooperativeFieldCashCashDetail',
  'cooperativeCashReport',
  'cooperativeDailyFieldCashReport',
  'financeTransactions',
  'financeBalance',
  'accountingPeriods',
  'accountingFiscalYears',
  'closingRuns',
  'fiscalYearClosingRuns',
  'closingPreview',
  'periodClosingPreview',
  'fiscalYearClosingPreview',
  'journalEntries',
  'trialBalance',
  'incomeStatement',
  'balanceSheet',
];

export default function SyncDatabaseManagement() {
  const queryClient = useQueryClient();
  const { t } = useI18n();
  const { message } = App.useApp();
  const syncStatus = useSyncStatus();
  const queueDetails = useSyncQueueDetails();
  const [health, setHealth] = useState<PostgresHealth>();
  const [isCheckingHealth, setIsCheckingHealth] = useState(false);
  const [isSyncingNow, setIsSyncingNow] = useState(false);
  const [isRetryingFailed, setIsRetryingFailed] = useState(false);
  const [statusFilter, setStatusFilter] = useState<ActiveQueueStatusFilter>('all');
  const [searchText, setSearchText] = useState('');

  const checkHealth = useCallback(async () => {
    setIsCheckingHealth(true);
    try {
      const nextHealth = await postgresAdapter.healthCheck();
      setHealth(nextHealth);
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('syncDb.healthCheckFailed'));
    } finally {
      setIsCheckingHealth(false);
    }
  }, [message, t]);

  useEffect(() => {
    void checkHealth();
  }, [checkHealth]);

  const handleSyncNow = async () => {
    setIsSyncingNow(true);
    try {
      const result = await runDatabaseSyncNow();
      SYNC_REFRESH_QUERY_KEYS.forEach((queryKey) => {
        queryClient.invalidateQueries({ queryKey: [queryKey] });
      });
      setHealth(result.postgresHealth);
      message.success(result.skipped ? t('syncDb.uploadOnlyStarted') : t('syncDb.syncStarted'));
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('syncDb.syncFailed'));
    } finally {
      setIsSyncingNow(false);
    }
  };

  const handleRetryFailed = async () => {
    setIsRetryingFailed(true);
    try {
      await retryFailedDatabaseSyncItems();
      message.success(t('sync.retryStarted'));
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('sync.retryFailed'));
    } finally {
      setIsRetryingFailed(false);
    }
  };

  const filteredActiveItems = useMemo(() => {
    const normalizedSearchText = searchText.trim().toLowerCase();

    return queueDetails.activeItems.filter((item) => {
      const matchesStatus = statusFilter === 'all' || item.status === statusFilter;
      const matchesSearch = !normalizedSearchText || [
        item.entity,
        getEntityLabel(item.entity),
        item.entity_id,
        item.operation,
        item.status,
        item.error_message,
      ].some((value) => String(value ?? '').toLowerCase().includes(normalizedSearchText));

      return matchesStatus && matchesSearch;
    });
  }, [queueDetails.activeItems, searchText, statusFilter]);

  const queueColumns = useMemo<TableProps<SyncQueueItem>['columns']>(() => [
    {
      title: t('syncDb.table.entity'),
      dataIndex: 'entity',
      key: 'entity',
      render: (entity: string, item) => (
        <div className="min-w-0">
          <div className="font-medium text-gray-900 dark:text-gray-100">{getEntityLabel(entity)}</div>
          <div className="truncate text-xs text-gray-500">{item.entity_id}</div>
        </div>
      ),
    },
    {
      title: t('syncDb.table.operation'),
      dataIndex: 'operation',
      key: 'operation',
      width: 120,
      render: (operation: SyncQueueItem['operation']) => (
        <Tag color={operationColor[operation]}>{t(`syncDb.operation.${operation}`)}</Tag>
      ),
    },
    {
      title: t('syncDb.table.status'),
      dataIndex: 'status',
      key: 'status',
      width: 130,
      render: (status: SyncQueueStatus) => (
        <Tag color={statusColor[status]}>{t(`syncDb.status.${status}`)}</Tag>
      ),
    },
    {
      title: t('syncDb.table.attempts'),
      dataIndex: 'attempts',
      key: 'attempts',
      width: 110,
      responsive: ['md'],
    },
    {
      title: t('syncDb.table.updatedAt'),
      dataIndex: 'updated_at',
      key: 'updated_at',
      width: 190,
      responsive: ['lg'],
      render: formatDateTime,
    },
    {
      title: t('syncDb.table.error'),
      dataIndex: 'error_message',
      key: 'error_message',
      render: (errorMessage?: string) => (
        errorMessage ? (
          <Tooltip title={errorMessage}>
            <span className="line-clamp-2 text-red-600 dark:text-red-300">{errorMessage}</span>
          </Tooltip>
        ) : (
          <span className="text-gray-400">-</span>
        )
      ),
    },
  ], [t]);

  const recentSyncedColumns = useMemo<TableProps<SyncQueueItem>['columns']>(() => [
    {
      title: t('syncDb.table.entity'),
      dataIndex: 'entity',
      key: 'entity',
      render: (entity: string, item) => (
        <div className="min-w-0">
          <div className="font-medium text-gray-900 dark:text-gray-100">{getEntityLabel(entity)}</div>
          <div className="truncate text-xs text-gray-500">{item.entity_id}</div>
        </div>
      ),
    },
    {
      title: t('syncDb.table.operation'),
      dataIndex: 'operation',
      key: 'operation',
      width: 120,
      render: (operation: SyncQueueItem['operation']) => (
        <Tag color={operationColor[operation]}>{t(`syncDb.operation.${operation}`)}</Tag>
      ),
    },
    {
      title: t('syncDb.table.syncedAt'),
      dataIndex: 'updated_at',
      key: 'updated_at',
      width: 190,
      render: formatDateTime,
    },
  ], [t]);

  const activeQueueTotal = queueDetails.counts.pending + queueDetails.counts.processing + queueDetails.counts.failed;
  const isBusy = syncStatus.isBusy || isSyncingNow || isRetryingFailed;
  const statCards: Array<{
    key: string;
    label: string;
    value: string | number;
    icon: LucideIcon;
    iconClassName: string;
    iconSpin?: boolean;
  }> = [
    {
      key: 'pending',
      label: t('sync.pending'),
      value: queueDetails.counts.pending,
      icon: RefreshCw,
      iconClassName: 'bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-300',
    },
    {
      key: 'processing',
      label: t('sync.processing'),
      value: queueDetails.counts.processing,
      icon: RotateCw,
      iconClassName: 'bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-300',
      iconSpin: syncStatus.isUploading,
    },
    {
      key: 'failed',
      label: t('sync.failed'),
      value: queueDetails.counts.failed,
      icon: AlertTriangle,
      iconClassName: 'bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-300',
    },
    {
      key: 'active',
      label: t('syncDb.activeQueue'),
      value: activeQueueTotal,
      icon: DatabaseZap,
      iconClassName: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950/30 dark:text-indigo-300',
    },
    {
      key: 'lastSynced',
      label: t('sync.lastSynced'),
      value: queueDetails.lastSyncedAt ? formatDateTime(queueDetails.lastSyncedAt) : t('sync.neverSynced'),
      icon: CheckCircle2,
      iconClassName: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-300',
    },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-1 md:p-4">
      <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-[#141829] md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-left text-2xl font-bold text-slate-950 dark:text-slate-50">
            <DatabaseZap className="h-7 w-7 text-blue-600" />
            {t('syncDb.title')}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Tag color={syncStatus.isOnline ? 'green' : 'default'} icon={syncStatus.isOnline ? <Cloud size={14} /> : <CloudOff size={14} />}>
              {syncStatus.isOnline ? t('sync.online') : t('sync.offline')}
            </Tag>
            <Tag color={getHealthTagColor(health)}>
              {health?.available ? t('syncDb.postgresAvailable') : t('syncDb.postgresUnavailable')}
            </Tag>
            {health?.message && <span className="text-sm text-slate-500 dark:text-slate-400">{health.message}</span>}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 md:justify-end">
          <Button
            icon={<RefreshCw size={16} />}
            loading={isCheckingHealth}
            onClick={checkHealth}
          >
            {t('syncDb.checkConnection')}
          </Button>
          <Button
            icon={<RotateCw size={16} />}
            disabled={queueDetails.counts.failed === 0 || isBusy}
            loading={isRetryingFailed}
            onClick={handleRetryFailed}
          >
            {t('sync.retryFailedItems')}
          </Button>
          <Button
            type="primary"
            icon={<ListRestart size={16} />}
            loading={isSyncingNow || syncStatus.isBusy}
            onClick={handleSyncNow}
          >
            {t('syncDb.syncNow')}
          </Button>
        </div>
      </div>

      {(syncStatus.activityErrorMessage || health?.status === 'migration_failed') && (
        <Alert
          type="error"
          showIcon
          message={t('syncDb.syncIssue')}
          description={syncStatus.activityErrorMessage ?? health?.message}
        />
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {statCards.map(({ key, label, value, icon: Icon, iconClassName, iconSpin }) => (
          <div key={key} className={statCardClassName}>
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium text-slate-500 dark:text-slate-400">{label}</span>
              <span className={`inline-flex h-9 w-9 items-center justify-center rounded-md ${iconClassName}`}>
                <Icon className={`h-5 w-5 ${iconSpin ? 'animate-spin' : ''}`} />
              </span>
            </div>
            <div className={`mt-2 truncate font-semibold text-slate-950 dark:text-slate-50 ${key === 'lastSynced' ? 'text-base' : 'text-2xl'}`}>
              {value}
            </div>
          </div>
        ))}
      </div>

      {queueDetails.entitySummaries.length > 0 && (
        <div className={panelClassName}>
          <div className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">{t('syncDb.entitySummary')}</div>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
            {queueDetails.entitySummaries.map((summary) => (
              <div key={summary.entity} className="flex items-center justify-between gap-3 rounded-md border border-slate-100 bg-slate-50/60 px-3 py-2 dark:border-slate-800 dark:bg-slate-950/20">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">{getEntityLabel(summary.entity)}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">{formatDateTime(summary.latestUpdatedAt)}</div>
                </div>
                <div className="flex shrink-0 gap-1">
                  {summary.pending > 0 && <Tag color="gold">{summary.pending}</Tag>}
                  {summary.processing > 0 && <Tag color="blue">{summary.processing}</Tag>}
                  {summary.failed > 0 && <Tag color="red">{summary.failed}</Tag>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className={panelClassName}>
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-950 dark:text-slate-50">{t('syncDb.queueTitle')}</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">{t('syncDb.queueCount', { count: filteredActiveItems.length })}</p>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(240px,1fr)_auto] lg:min-w-[520px]">
            <Input
              allowClear
              prefix={<Search size={16} className="text-gray-400" />}
              value={searchText}
              placeholder={t('syncDb.searchPlaceholder')}
              onChange={(event) => setSearchText(event.target.value)}
            />
            <Segmented<ActiveQueueStatusFilter>
              value={statusFilter}
              onChange={setStatusFilter}
              options={activeStatusOptions.map((status) => ({
                value: status,
                label: t(`syncDb.filter.${status}`),
              }))}
            />
          </div>
        </div>

        <Table<SyncQueueItem>
          rowKey="id"
          columns={queueColumns}
          dataSource={filteredActiveItems}
          pagination={{ pageSize: 10, showSizeChanger: true }}
          scroll={{ x: 780 }}
          size="middle"
          locale={{ emptyText: <Empty description={t('syncDb.emptyQueue')} /> }}
        />
      </div>

      <div className={panelClassName}>
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-slate-950 dark:text-slate-50">{t('syncDb.recentSyncedTitle')}</h2>
        </div>
        <Table<SyncQueueItem>
          rowKey="id"
          columns={recentSyncedColumns}
          dataSource={queueDetails.recentSyncedItems}
          pagination={false}
          scroll={{ x: 560 }}
          size="middle"
          locale={{ emptyText: <Empty description={t('syncDb.emptyRecentSynced')} /> }}
        />
      </div>
    </div>
  );
}
