import { db } from '@/lib/db';
import { mergeRemoteDepartmentsIntoDexie } from '@/services/departmentReadService';
import { mergeRemoteProjectsIntoDexie } from '@/services/projectReadService';
import { mergeRemoteTaxesIntoDexie } from '@/services/taxReadService';
import {
  departmentPostgresAdapter,
  isTauriRuntime,
  projectPostgresAdapter,
  taxPostgresAdapter,
  type RemoteDepartmentDto,
  type RemoteProjectDto,
  type RemoteTaxDto,
} from '@/services/postgresAdapter';
import type { Department, Project, SyncQueueItem, SyncQueueOperation, Tax } from '@/types';

const SYNC_QUEUE_BATCH_SIZE = 20;
const DEPARTMENT_ENTITY = 'departments';
const PROJECT_ENTITY = 'projects';
const TAX_ENTITY = 'taxes';

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

const mapProjectToRemoteDto = (project: Project): RemoteProjectDto => ({
  id: project.id,
  code: project.code,
  name: project.name,
  status: project.status,
  contact_id: project.contact_id,
  contact_name: project.contact_name,
  department_id: project.department_id,
  department_code: project.department_code,
  department_name: project.department_name,
  start_date: project.start_date,
  end_date: project.end_date,
  budget_amount: project.budget_amount,
  description: project.description,
  is_active: project.is_active,
  created_at: project.created_at,
  updated_at: project.updated_at,
});

const mapTaxToRemoteDto = (tax: Tax): RemoteTaxDto => ({
  id: tax.id,
  code: tax.code,
  name: tax.name,
  rate: tax.rate,
  rate_type: tax.rate_type,
  calculation_mode: tax.calculation_mode,
  description: tax.description,
  effective_from: tax.effective_from,
  effective_to: tax.effective_to,
  is_default: tax.is_default,
  is_active: tax.is_active,
  created_at: tax.created_at,
  updated_at: tax.updated_at,
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

const isRemoteProjectDto = (payload: unknown): payload is RemoteProjectDto => {
  if (!payload || typeof payload !== 'object') return false;

  const candidate = payload as Partial<RemoteProjectDto>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.name === 'string' &&
    typeof candidate.status === 'string' &&
    typeof candidate.is_active === 'boolean' &&
    typeof candidate.created_at === 'string' &&
    typeof candidate.updated_at === 'string'
  );
};

const isRemoteTaxDto = (payload: unknown): payload is RemoteTaxDto => {
  if (!payload || typeof payload !== 'object') return false;

  const candidate = payload as Partial<RemoteTaxDto>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.name === 'string' &&
    typeof candidate.rate === 'number' &&
    typeof candidate.rate_type === 'string' &&
    typeof candidate.calculation_mode === 'string' &&
    typeof candidate.is_default === 'boolean' &&
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

const updateProjectSyncMetadata = async (
  projectId: string,
  sourceUpdatedAt: string,
  syncMetadata: Partial<Pick<Project, 'sync_status' | 'sync_error' | 'last_synced_at' | 'remote_updated_at'>>,
) => {
  const currentProject = await db.projects.get(projectId);
  if (!currentProject || currentProject.updated_at !== sourceUpdatedAt) return;

  await db.projects.update(projectId, syncMetadata);
};

const updateTaxSyncMetadata = async (
  taxId: string,
  sourceUpdatedAt: string,
  syncMetadata: Partial<Pick<Tax, 'sync_status' | 'sync_error' | 'last_synced_at' | 'remote_updated_at'>>,
) => {
  const currentTax = await db.taxes.get(taxId);
  if (!currentTax || currentTax.updated_at !== sourceUpdatedAt) return;

  await db.taxes.update(taxId, syncMetadata);
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

  if (queueItem.entity === PROJECT_ENTITY && isRemoteProjectDto(queueItem.payload)) {
    await updateProjectSyncMetadata(queueItem.entity_id, queueItem.payload.updated_at, {
      sync_status: 'failed',
      sync_error: errorMessage,
    });
  }

  if (queueItem.entity === TAX_ENTITY && isRemoteTaxDto(queueItem.payload)) {
    await updateTaxSyncMetadata(queueItem.entity_id, queueItem.payload.updated_at, {
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

const processProjectQueueItem = async (queueItem: SyncQueueItem) => {
  if (queueItem.operation === 'delete') {
    return projectPostgresAdapter.delete(queueItem.entity_id);
  }

  if (!isRemoteProjectDto(queueItem.payload)) {
    throw new Error('Payload project sync queue tidak valid.');
  }

  return projectPostgresAdapter.upsert(queueItem.payload);
};

const processTaxQueueItem = async (queueItem: SyncQueueItem) => {
  if (queueItem.operation === 'delete') {
    return taxPostgresAdapter.delete(queueItem.entity_id);
  }

  if (!isRemoteTaxDto(queueItem.payload)) {
    throw new Error('Payload tax sync queue tidak valid.');
  }

  return taxPostgresAdapter.upsert(queueItem.payload);
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
    let remoteProject: RemoteProjectDto | null = null;
    let remoteTax: RemoteTaxDto | null = null;

    if (currentQueueItem.entity === DEPARTMENT_ENTITY) {
      remoteDepartment = await processDepartmentQueueItem(currentQueueItem);
    } else if (currentQueueItem.entity === PROJECT_ENTITY) {
      remoteProject = await processProjectQueueItem(currentQueueItem);
    } else if (currentQueueItem.entity === TAX_ENTITY) {
      remoteTax = await processTaxQueueItem(currentQueueItem);
    } else {
      throw new Error(`Entity sync queue tidak didukung: ${currentQueueItem.entity}`);
    }

    if (
      currentQueueItem.entity === DEPARTMENT_ENTITY &&
      !remoteDepartment &&
      currentQueueItem.operation === 'delete' &&
      isRemoteDepartmentDto(currentQueueItem.payload)
    ) {
      const syncedAt = new Date().toISOString();
      await markQueueItemSynced(currentQueueItem.id, syncedAt);
      await updateDepartmentSyncMetadata(currentQueueItem.entity_id, currentQueueItem.payload.updated_at, {
        sync_status: 'synced',
        sync_error: undefined,
        last_synced_at: syncedAt,
      });
      return;
    }

    if (
      currentQueueItem.entity === TAX_ENTITY &&
      !remoteTax &&
      currentQueueItem.operation === 'delete' &&
      isRemoteTaxDto(currentQueueItem.payload)
    ) {
      const syncedAt = new Date().toISOString();
      await markQueueItemSynced(currentQueueItem.id, syncedAt);
      await updateTaxSyncMetadata(currentQueueItem.entity_id, currentQueueItem.payload.updated_at, {
        sync_status: 'synced',
        sync_error: undefined,
        last_synced_at: syncedAt,
      });
      return;
    }

    if (
      currentQueueItem.entity === PROJECT_ENTITY &&
      !remoteProject &&
      currentQueueItem.operation === 'delete' &&
      isRemoteProjectDto(currentQueueItem.payload)
    ) {
      const syncedAt = new Date().toISOString();
      await markQueueItemSynced(currentQueueItem.id, syncedAt);
      await updateProjectSyncMetadata(currentQueueItem.entity_id, currentQueueItem.payload.updated_at, {
        sync_status: 'synced',
        sync_error: undefined,
        last_synced_at: syncedAt,
      });
      return;
    }

    const syncedAt = new Date().toISOString();

    if (remoteDepartment && isRemoteDepartmentDto(currentQueueItem.payload)) {
      await markQueueItemSynced(currentQueueItem.id, syncedAt);
      await updateDepartmentSyncMetadata(currentQueueItem.entity_id, currentQueueItem.payload.updated_at, {
        sync_status: 'synced',
        sync_error: undefined,
        last_synced_at: syncedAt,
        remote_updated_at: remoteDepartment.updated_at,
      });
      await mergeRemoteDepartmentsIntoDexie([remoteDepartment], syncedAt);
      return;
    }

    if (remoteProject && isRemoteProjectDto(currentQueueItem.payload)) {
      await markQueueItemSynced(currentQueueItem.id, syncedAt);
      await updateProjectSyncMetadata(currentQueueItem.entity_id, currentQueueItem.payload.updated_at, {
        sync_status: 'synced',
        sync_error: undefined,
        last_synced_at: syncedAt,
        remote_updated_at: remoteProject.updated_at,
      });
      await mergeRemoteProjectsIntoDexie([remoteProject], syncedAt);
      return;
    }

    if (remoteTax && isRemoteTaxDto(currentQueueItem.payload)) {
      await markQueueItemSynced(currentQueueItem.id, syncedAt);
      await updateTaxSyncMetadata(currentQueueItem.entity_id, currentQueueItem.payload.updated_at, {
        sync_status: 'synced',
        sync_error: undefined,
        last_synced_at: syncedAt,
        remote_updated_at: remoteTax.updated_at,
      });
      await mergeRemoteTaxesIntoDexie([remoteTax], syncedAt);
      return;
    }

    await markQueueItemPending(currentQueueItem.id);
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

export const enqueueProjectSync = async (
  project: Project,
  operation: SyncQueueOperation,
) => {
  const now = new Date().toISOString();
  const queueItem: SyncQueueItem = {
    id: crypto.randomUUID(),
    entity: PROJECT_ENTITY,
    entity_id: project.id,
    operation,
    payload: mapProjectToRemoteDto(project),
    status: 'pending',
    attempts: 0,
    created_at: now,
    updated_at: now,
  };

  await db.syncQueue.add(queueItem);
  void processPendingSyncQueue();

  return queueItem;
};

export const enqueueTaxSync = async (
  tax: Tax,
  operation: SyncQueueOperation,
) => {
  const now = new Date().toISOString();
  const queueItem: SyncQueueItem = {
    id: crypto.randomUUID(),
    entity: TAX_ENTITY,
    entity_id: tax.id,
    operation,
    payload: mapTaxToRemoteDto(tax),
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
