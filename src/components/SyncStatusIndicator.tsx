import { useState } from 'react';
import { Button, Divider, Popover, Tag, Typography, App as AntdApp } from 'antd';
import { AlertTriangle, CheckCircle2, Cloud, CloudOff, Clock, RefreshCw, RotateCw } from 'lucide-react';
import { useI18n } from '@/hooks/useI18n';
import { useSyncStatus } from '@/hooks/useSyncStatus';
import { processPendingSyncQueue, retryFailedSyncQueueItems } from '@/services/syncQueueService';

const { Text } = Typography;

export const SyncStatusIndicator = () => {
  const { t } = useI18n();
  const { message } = AntdApp.useApp();
  const [isRetrying, setIsRetrying] = useState(false);
  const syncStatus = useSyncStatus();

  const handleRetry = async () => {
    setIsRetrying(true);
    try {
      await retryFailedSyncQueueItems();
      void processPendingSyncQueue();
      message.success(t('sync.retryStarted'));
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('sync.retryFailed'));
    } finally {
      setIsRetrying(false);
    }
  };

  const statusConfig = (() => {
    if (!syncStatus.isOnline) {
      return {
        icon: <CloudOff size={18} />,
        label: t('sync.offline'),
        className: 'text-gray-500 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700',
      };
    }

    if (syncStatus.hasFailed) {
      return {
        icon: <AlertTriangle size={18} />,
        label: syncStatus.counts.failed > 0
          ? t('sync.failedCount', { count: syncStatus.counts.failed })
          : t('sync.error'),
        className: 'text-red-600 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/40',
      };
    }

    if (syncStatus.isBusy) {
      return {
        icon: <RefreshCw size={18} className="animate-spin" />,
        label: syncStatus.isRefreshing ? t('sync.refreshing') : t('sync.syncing'),
        className: 'text-blue-600 hover:bg-blue-50 dark:text-blue-300 dark:hover:bg-blue-950/40',
      };
    }

    if (syncStatus.hasPending) {
      return {
        icon: <Clock size={18} />,
        label: t('sync.pendingCount', { count: syncStatus.counts.pending }),
        className: 'text-amber-600 hover:bg-amber-50 dark:text-amber-300 dark:hover:bg-amber-950/40',
      };
    }

    return {
      icon: <CheckCircle2 size={18} />,
      label: t('sync.saved'),
      className: 'text-emerald-600 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-950/40',
    };
  })();

  const popoverContent = (
    <div className="w-72">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {syncStatus.isOnline ? <Cloud size={18} /> : <CloudOff size={18} />}
          <Text strong>{t('sync.status')}</Text>
        </div>
        <Tag color={syncStatus.isOnline ? 'green' : 'default'}>
          {syncStatus.isOnline ? t('sync.online') : t('sync.offline')}
        </Tag>
      </div>

      <Divider className="my-3" />

      <div className="space-y-2 text-sm">
        <div className="flex justify-between gap-3">
          <Text type="secondary">{t('sync.activity')}</Text>
          <Text>{syncStatus.isRefreshing ? t('sync.refreshing') : syncStatus.isUploading ? t('sync.uploading') : t('sync.idle')}</Text>
        </div>
        <div className="flex justify-between gap-3">
          <Text type="secondary">{t('sync.pending')}</Text>
          <Text>{syncStatus.counts.pending}</Text>
        </div>
        <div className="flex justify-between gap-3">
          <Text type="secondary">{t('sync.processing')}</Text>
          <Text>{syncStatus.counts.processing}</Text>
        </div>
        <div className="flex justify-between gap-3">
          <Text type="secondary">{t('sync.failed')}</Text>
          <Text>{syncStatus.counts.failed}</Text>
        </div>
        <div className="flex justify-between gap-3">
          <Text type="secondary">{t('sync.lastSynced')}</Text>
          <Text>{syncStatus.lastSyncedAt ? new Date(syncStatus.lastSyncedAt).toLocaleTimeString() : t('sync.neverSynced')}</Text>
        </div>
      </div>

      {(syncStatus.activityErrorMessage || syncStatus.failedItems.length > 0) && (
        <>
          <Divider className="my-3" />
          <div className="space-y-2">
            {syncStatus.activityErrorMessage && (
              <Text type="danger" className="block text-sm">{syncStatus.activityErrorMessage}</Text>
            )}
            {syncStatus.failedItems.map((item) => (
              <div key={item.id} className="rounded-md border border-red-100 bg-red-50 px-2 py-1.5 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
                <div className="font-medium">{item.entity}</div>
                <div className="truncate">{item.error_message ?? t('sync.unknownError')}</div>
              </div>
            ))}
          </div>
        </>
      )}

      {syncStatus.counts.failed > 0 && (
        <Button
          type="primary"
          size="small"
          icon={<RotateCw size={14} />}
          loading={isRetrying}
          onClick={handleRetry}
          className="mt-3 w-full"
        >
          {t('sync.retryFailedItems')}
        </Button>
      )}
    </div>
  );

  return (
    <Popover content={popoverContent} trigger="click" placement="bottomRight">
      <button
        type="button"
        className={`flex max-w-44 items-center gap-1.5 rounded-full px-2 py-2 text-sm font-medium transition-colors focus:outline-none ${statusConfig.className}`}
        aria-label={t('sync.openStatus')}
        title={t('sync.openStatus')}
      >
        {statusConfig.icon}
        <span className="hidden leading-none sm:inline truncate">{statusConfig.label}</span>
      </button>
    </Popover>
  );
};
