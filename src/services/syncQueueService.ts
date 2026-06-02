import { db } from '@/lib/db';
import { mergeRemoteDepartmentsIntoDexie } from '@/services/departmentReadService';
import { departmentPostgresAdapter, isTauriRuntime, type RemoteDepartmentDto } from '@/services/postgresAdapter';
import type { Department, SyncQueueItem, SyncQueueOperation } from '@/types';

const SYNC_QUEUE_BATCH_SIZE = 20;
const DEPARTMENT_ENTITY = 'departments';

let isProcessingSyncQueue = false;

const getErrorMessage = (error: unknown) => (
  error instanceof Error ? error.message : String(error)
);

const mapDepartmentToRemoteDto = (department: Department): RemoteDepartmentDto => ({
  id: department.id,
  code: department.code,
  name: department.name,
  description: department.description,
  is_active: department.is_active,
  created_at: department.created_at,
  updated_at: department.updated_at,
});

const isRemoteDepartmentDto = (payload: unknown): payload is RemoteDepartmentDto => {
  if (!payload || typeof payload !== 'object') return false;

  const candidate = payload as Partial<RemoteDepartmentDto>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.name === 'string' &&
    typeof candidate.is_active === 'boolean' &&
    typeof candidate.created_at === 'string' &&
    typeof candidate.updated_at === 'string'
  );
};

const updateDepartmentSyncMetadata = async (
  departmentId: string,
  sourceUpdatedAt: string,
  syncMetadata: Partial<Pick<Department, 'sync_status' | 'sync_error' | 'last_synced_at' | 'remote_updated_at'>>,
) => {
  const currentDepartment = await db.departments.get(departmentId);
  if (!currentDepartment || currentDepartment.updated_at !== sourceUpdatedAt) return;

  await db.departments.update(departmentId, syncMetadata);
};

const markQueueItemPending = async (queueItemId: string) => {
  await db.syncQueue.update(queueItemId, {
    status: 'pending',
    updated_at: new Date().toISOString(),
  });
};

const markQueueItemSynced = async (queueItemId: string, syncedAt: string) => {
  await db.syncQueue.update(queueItemId, {
    status: 'synced',
    error_message: undefined,
    updated_at: syncedAt,
  });
};

const markQueueItemFailed = async (queueItem: SyncQueueItem, error: unknown) => {
  const errorMessage = getErrorMessage(error);
  const now = new Date().toISOString();

  await db.syncQueue.update(queueItem.id, {
    status: 'failed',
    error_message: errorMessage,
    updated_at: now,
  });

  if (queueItem.entity === DEPARTMENT_ENTITY && isRemoteDepartmentDto(queueItem.payload)) {
    await updateDepartmentSyncMetadata(queueItem.entity_id, queueItem.payload.updated_at, {
      sync_status: 'failed',
      sync_error: errorMessage,
    });
  }
};

const processDepartmentQueueItem = async (queueItem: SyncQueueItem) => {
  if (queueItem.operation === 'delete') {
    return departmentPostgresAdapter.delete(queueItem.entity_id);
  }

  if (!isRemoteDepartmentDto(queueItem.payload)) {
    throw new Error('Payload department sync queue tidak valid.');
  }

  return departmentPostgresAdapter.upsert(queueItem.payload);
};

const processSyncQueueItem = async (queueItem: SyncQueueItem) => {
  const currentQueueItem = await db.syncQueue.get(queueItem.id);
  if (!currentQueueItem || currentQueueItem.status !== 'pending') return;

  const processingAt = new Date().toISOString();
  await db.syncQueue.update(currentQueueItem.id, {
    status: 'processing',
    attempts: currentQueueItem.attempts + 1,
    error_message: undefined,
    updated_at: processingAt,
  });

  try {
    let remoteDepartment: RemoteDepartmentDto | null = null;

    if (currentQueueItem.entity === DEPARTMENT_ENTITY) {
      remoteDepartment = await processDepartmentQueueItem(currentQueueItem);
    } else {
      throw new Error(`Entity sync queue tidak didukung: ${currentQueueItem.entity}`);
    }

    if (!remoteDepartment && currentQueueItem.operation === 'delete' && isRemoteDepartmentDto(currentQueueItem.payload)) {
      const syncedAt = new Date().toISOString();
      await markQueueItemSynced(currentQueueItem.id, syncedAt);
      await updateDepartmentSyncMetadata(currentQueueItem.entity_id, currentQueueItem.payload.updated_at, {
        sync_status: 'synced',
        sync_error: undefined,
        last_synced_at: syncedAt,
      });
      return;
    }

    if (!remoteDepartment) {
      await markQueueItemPending(currentQueueItem.id);
      return;
    }

    const syncedAt = new Date().toISOString();
    await markQueueItemSynced(currentQueueItem.id, syncedAt);

    if (isRemoteDepartmentDto(currentQueueItem.payload)) {
      await updateDepartmentSyncMetadata(currentQueueItem.entity_id, currentQueueItem.payload.updated_at, {
        sync_status: 'synced',
        sync_error: undefined,
        last_synced_at: syncedAt,
        remote_updated_at: remoteDepartment.updated_at,
      });
      await mergeRemoteDepartmentsIntoDexie([remoteDepartment], syncedAt);
    }
  } catch (error) {
    await markQueueItemFailed(currentQueueItem, error);
    console.error('Failed to process PostgreSQL sync queue item', error);
  }
};

export const processPendingSyncQueue = async (limit = SYNC_QUEUE_BATCH_SIZE) => {
  if (isProcessingSyncQueue || !isTauriRuntime()) return;

  isProcessingSyncQueue = true;
  try {
    const pendingQueueItems = (await db.syncQueue
      .where('status')
      .equals('pending')
      .sortBy('created_at'))
      .slice(0, limit);

    for (const queueItem of pendingQueueItems) {
      await processSyncQueueItem(queueItem);
    }
  } finally {
    isProcessingSyncQueue = false;
  }

  const pendingQueueCount = await db.syncQueue.where('status').equals('pending').count();
  if (pendingQueueCount > 0) {
    void processPendingSyncQueue(limit);
  }
};

export const enqueueDepartmentSync = async (
  department: Department,
  operation: SyncQueueOperation,
) => {
  const now = new Date().toISOString();
  const queueItem: SyncQueueItem = {
    id: crypto.randomUUID(),
    entity: DEPARTMENT_ENTITY,
    entity_id: department.id,
    operation,
    payload: mapDepartmentToRemoteDto(department),
    status: 'pending',
    attempts: 0,
    created_at: now,
    updated_at: now,
  };

  await db.syncQueue.add(queueItem);
  void processPendingSyncQueue();

  return queueItem;
};

export const retryFailedSyncQueueItems = async () => {
  const failedQueueItems = await db.syncQueue.where('status').equals('failed').toArray();
  const now = new Date().toISOString();

  await Promise.all(failedQueueItems.map((queueItem) => (
    db.syncQueue.update(queueItem.id, {
      status: 'pending',
      error_message: undefined,
      updated_at: now,
    })
  )));

  void processPendingSyncQueue();
};
