import { db } from '@/lib/db';
import { mergeRemoteContactsIntoDexie } from '@/services/contactReadService';
import { mergeRemoteDepartmentsIntoDexie } from '@/services/departmentReadService';
import { mergeRemoteProductsIntoDexie } from '@/services/productReadService';
import { mergeRemoteProjectsIntoDexie } from '@/services/projectReadService';
import { mergeRemoteTaxesIntoDexie } from '@/services/taxReadService';
import { mergeRemoteWarehousesIntoDexie } from '@/services/warehouseReadService';
import {
  contactPostgresAdapter,
  departmentPostgresAdapter,
  isTauriRuntime,
  productPostgresAdapter,
  projectPostgresAdapter,
  stockMutationPostgresAdapter,
  taxPostgresAdapter,
  warehousePostgresAdapter,
  type RemoteContactDto,
  type RemoteDepartmentDto,
  type RemoteProductDto,
  type RemoteProjectDto,
  type RemoteStockMutationDto,
  type RemoteTaxDto,
  type RemoteWarehouseDto,
} from '@/services/postgresAdapter';
import type { Contact, Department, Product, Project, StockMutation, SyncQueueItem, SyncQueueOperation, Tax, Warehouse } from '@/types';

const SYNC_QUEUE_BATCH_SIZE = 20;
const CONTACT_ENTITY = 'contacts';
const DEPARTMENT_ENTITY = 'departments';
const PRODUCT_ENTITY = 'products';
const PROJECT_ENTITY = 'projects';
const STOCK_MUTATION_ENTITY = 'stockMutations';
const TAX_ENTITY = 'taxes';
const WAREHOUSE_ENTITY = 'warehouses';

let isProcessingSyncQueue = false;

const getErrorMessage = (error: unknown) => (
  error instanceof Error ? error.message : String(error)
);

const normalizeRemoteNumber = (value: number | undefined) => (
  typeof value === 'number' && Number.isFinite(value) ? value : 0
);

const mapContactToRemoteDto = (contact: Contact): RemoteContactDto => ({
  id: contact.id,
  name: contact.name,
  contact_type: contact.contact_type,
  phone: contact.phone,
  email: contact.email,
  address: contact.address,
  company_name: contact.company_name,
  tax_number: contact.tax_number,
  notes: contact.notes,
  is_active: contact.is_active,
  created_at: contact.created_at,
  updated_at: contact.updated_at,
});

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

const mapProductToRemoteDto = (product: Product): RemoteProductDto => ({
  id: product.id,
  name: product.name,
  category: product.category,
  purchase_unit: product.purchase_unit,
  selling_unit: product.selling_unit,
  purchase_price: normalizeRemoteNumber(product.purchase_price),
  selling_price: normalizeRemoteNumber(product.selling_price),
  stock: normalizeRemoteNumber(product.stock),
  sku: product.sku,
  wholesale_prices: product.wholesale_prices,
  sellable_units: product.sellable_units,
  unit_mappings: product.unit_mappings,
  created_at: product.created_at,
  updated_at: product.updated_at,
});

const mapStockMutationToRemoteDto = (mutation: StockMutation): RemoteStockMutationDto => ({
  id: mutation.id,
  product_id: mutation.product_id,
  product_name: mutation.product_name,
  sku: mutation.sku,
  warehouse_id: mutation.warehouse_id,
  warehouse_code: mutation.warehouse_code,
  warehouse_name: mutation.warehouse_name,
  source_type: mutation.source_type,
  source_id: mutation.source_id,
  source_number: mutation.source_number,
  source_line_id: mutation.source_line_id,
  quantity_delta: mutation.quantity_delta,
  unit: mutation.unit,
  stock_unit: mutation.stock_unit,
  source_quantity: mutation.source_quantity,
  source_unit: mutation.source_unit,
  reason: mutation.reason,
  actor_user_id: mutation.actor_user_id,
  actor_user_name: mutation.actor_user_name,
  occurred_at: mutation.occurred_at,
  created_at: mutation.created_at,
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

const mapWarehouseToRemoteDto = (warehouse: Warehouse): RemoteWarehouseDto => ({
  id: warehouse.id,
  code: warehouse.code,
  name: warehouse.name,
  address: warehouse.address,
  phone: warehouse.phone,
  notes: warehouse.notes,
  is_active: warehouse.is_active,
  created_at: warehouse.created_at,
  updated_at: warehouse.updated_at,
});

const isRemoteContactDto = (payload: unknown): payload is RemoteContactDto => {
  if (!payload || typeof payload !== 'object') return false;

  const candidate = payload as Partial<RemoteContactDto>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.name === 'string' &&
    typeof candidate.contact_type === 'string' &&
    typeof candidate.is_active === 'boolean' &&
    typeof candidate.created_at === 'string' &&
    typeof candidate.updated_at === 'string'
  );
};

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

const isRemoteProductDto = (payload: unknown): payload is RemoteProductDto => {
  if (!payload || typeof payload !== 'object') return false;

  const candidate = payload as Partial<RemoteProductDto>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.name === 'string' &&
    typeof candidate.purchase_unit === 'string' &&
    typeof candidate.selling_unit === 'string' &&
    typeof candidate.purchase_price === 'number' &&
    typeof candidate.selling_price === 'number' &&
    typeof candidate.stock === 'number' &&
    typeof candidate.created_at === 'string' &&
    typeof candidate.updated_at === 'string'
  );
};

const isRemoteStockMutationDto = (payload: unknown): payload is RemoteStockMutationDto => {
  if (!payload || typeof payload !== 'object') return false;

  const candidate = payload as Partial<RemoteStockMutationDto>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.product_id === 'string' &&
    typeof candidate.product_name === 'string' &&
    typeof candidate.source_type === 'string' &&
    typeof candidate.source_id === 'string' &&
    typeof candidate.source_line_id === 'string' &&
    typeof candidate.quantity_delta === 'number' &&
    typeof candidate.unit === 'string' &&
    typeof candidate.stock_unit === 'string' &&
    typeof candidate.occurred_at === 'string' &&
    typeof candidate.created_at === 'string'
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

const isRemoteWarehouseDto = (payload: unknown): payload is RemoteWarehouseDto => {
  if (!payload || typeof payload !== 'object') return false;

  const candidate = payload as Partial<RemoteWarehouseDto>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.name === 'string' &&
    typeof candidate.is_active === 'boolean' &&
    typeof candidate.created_at === 'string' &&
    typeof candidate.updated_at === 'string'
  );
};

const updateContactSyncMetadata = async (
  contactId: string,
  sourceUpdatedAt: string,
  syncMetadata: Partial<Pick<Contact, 'sync_status' | 'sync_error' | 'last_synced_at' | 'remote_updated_at'>>,
) => {
  const currentContact = await db.contacts.get(contactId);
  if (!currentContact || currentContact.updated_at !== sourceUpdatedAt) return;

  await db.contacts.update(contactId, syncMetadata);
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

const updateProductSyncMetadata = async (
  productId: string,
  sourceUpdatedAt: string,
  syncMetadata: Partial<Pick<Product, 'sync_status' | 'sync_error' | 'last_synced_at' | 'remote_updated_at'>>,
) => {
  const currentProduct = await db.products.get(productId);
  if (!currentProduct || currentProduct.updated_at !== sourceUpdatedAt) return;

  await db.products.update(productId, syncMetadata);
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

const updateWarehouseSyncMetadata = async (
  warehouseId: string,
  sourceUpdatedAt: string,
  syncMetadata: Partial<Pick<Warehouse, 'sync_status' | 'sync_error' | 'last_synced_at' | 'remote_updated_at'>>,
) => {
  const currentWarehouse = await db.warehouses.get(warehouseId);
  if (!currentWarehouse || currentWarehouse.updated_at !== sourceUpdatedAt) return;

  await db.warehouses.update(warehouseId, syncMetadata);
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

  if (queueItem.entity === CONTACT_ENTITY && isRemoteContactDto(queueItem.payload)) {
    await updateContactSyncMetadata(queueItem.entity_id, queueItem.payload.updated_at, {
      sync_status: 'failed',
      sync_error: errorMessage,
    });
  }

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

  if (queueItem.entity === PRODUCT_ENTITY && isRemoteProductDto(queueItem.payload)) {
    await updateProductSyncMetadata(queueItem.entity_id, queueItem.payload.updated_at, {
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

  if (queueItem.entity === WAREHOUSE_ENTITY && isRemoteWarehouseDto(queueItem.payload)) {
    await updateWarehouseSyncMetadata(queueItem.entity_id, queueItem.payload.updated_at, {
      sync_status: 'failed',
      sync_error: errorMessage,
    });
  }
};

const processContactQueueItem = async (queueItem: SyncQueueItem) => {
  if (queueItem.operation === 'delete') {
    return contactPostgresAdapter.delete(queueItem.entity_id);
  }

  if (!isRemoteContactDto(queueItem.payload)) {
    throw new Error('Payload contact sync queue tidak valid.');
  }

  return contactPostgresAdapter.upsert(queueItem.payload);
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

const processProductQueueItem = async (queueItem: SyncQueueItem) => {
  if (queueItem.operation === 'delete') {
    return productPostgresAdapter.delete(queueItem.entity_id);
  }

  if (!isRemoteProductDto(queueItem.payload)) {
    throw new Error('Payload product sync queue tidak valid.');
  }

  return productPostgresAdapter.upsert(queueItem.payload);
};

const processStockMutationQueueItem = async (queueItem: SyncQueueItem) => {
  if (queueItem.operation === 'delete') {
    throw new Error('Stock mutation sync queue tidak mendukung operasi delete.');
  }

  if (!isRemoteStockMutationDto(queueItem.payload)) {
    throw new Error('Payload stock mutation sync queue tidak valid.');
  }

  return stockMutationPostgresAdapter.upsert(queueItem.payload);
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

const processWarehouseQueueItem = async (queueItem: SyncQueueItem) => {
  if (queueItem.operation === 'delete') {
    return warehousePostgresAdapter.delete(queueItem.entity_id);
  }

  if (!isRemoteWarehouseDto(queueItem.payload)) {
    throw new Error('Payload gudang sync queue tidak valid.');
  }

  return warehousePostgresAdapter.upsert(queueItem.payload);
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
    let remoteContact: RemoteContactDto | null = null;
    let remoteDepartment: RemoteDepartmentDto | null = null;
    let remoteProduct: RemoteProductDto | null = null;
    let remoteProject: RemoteProjectDto | null = null;
    let remoteStockMutation: RemoteStockMutationDto | null = null;
    let remoteTax: RemoteTaxDto | null = null;
    let remoteWarehouse: RemoteWarehouseDto | null = null;

    if (currentQueueItem.entity === CONTACT_ENTITY) {
      remoteContact = await processContactQueueItem(currentQueueItem);
    } else if (currentQueueItem.entity === DEPARTMENT_ENTITY) {
      remoteDepartment = await processDepartmentQueueItem(currentQueueItem);
    } else if (currentQueueItem.entity === PRODUCT_ENTITY) {
      remoteProduct = await processProductQueueItem(currentQueueItem);
    } else if (currentQueueItem.entity === PROJECT_ENTITY) {
      remoteProject = await processProjectQueueItem(currentQueueItem);
    } else if (currentQueueItem.entity === STOCK_MUTATION_ENTITY) {
      remoteStockMutation = await processStockMutationQueueItem(currentQueueItem);
    } else if (currentQueueItem.entity === TAX_ENTITY) {
      remoteTax = await processTaxQueueItem(currentQueueItem);
    } else if (currentQueueItem.entity === WAREHOUSE_ENTITY) {
      remoteWarehouse = await processWarehouseQueueItem(currentQueueItem);
    } else {
      throw new Error(`Entity sync queue tidak didukung: ${currentQueueItem.entity}`);
    }

    if (
      currentQueueItem.entity === CONTACT_ENTITY &&
      !remoteContact &&
      currentQueueItem.operation === 'delete' &&
      isRemoteContactDto(currentQueueItem.payload)
    ) {
      const syncedAt = new Date().toISOString();
      await markQueueItemSynced(currentQueueItem.id, syncedAt);
      await updateContactSyncMetadata(currentQueueItem.entity_id, currentQueueItem.payload.updated_at, {
        sync_status: 'synced',
        sync_error: undefined,
        last_synced_at: syncedAt,
      });
      return;
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
      currentQueueItem.entity === PRODUCT_ENTITY &&
      !remoteProduct &&
      currentQueueItem.operation === 'delete' &&
      isRemoteProductDto(currentQueueItem.payload)
    ) {
      const syncedAt = new Date().toISOString();
      await markQueueItemSynced(currentQueueItem.id, syncedAt);
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
      currentQueueItem.entity === WAREHOUSE_ENTITY &&
      !remoteWarehouse &&
      currentQueueItem.operation === 'delete' &&
      isRemoteWarehouseDto(currentQueueItem.payload)
    ) {
      const syncedAt = new Date().toISOString();
      await markQueueItemSynced(currentQueueItem.id, syncedAt);
      await updateWarehouseSyncMetadata(currentQueueItem.entity_id, currentQueueItem.payload.updated_at, {
        sync_status: 'synced',
        sync_error: undefined,
        last_synced_at: syncedAt,
      });
      return;
    }

    const syncedAt = new Date().toISOString();

    if (remoteContact && isRemoteContactDto(currentQueueItem.payload)) {
      await markQueueItemSynced(currentQueueItem.id, syncedAt);
      await updateContactSyncMetadata(currentQueueItem.entity_id, currentQueueItem.payload.updated_at, {
        sync_status: 'synced',
        sync_error: undefined,
        last_synced_at: syncedAt,
        remote_updated_at: remoteContact.updated_at,
      });
      await mergeRemoteContactsIntoDexie([remoteContact], syncedAt);
      return;
    }

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

    if (remoteProduct && isRemoteProductDto(currentQueueItem.payload)) {
      await markQueueItemSynced(currentQueueItem.id, syncedAt);
      await updateProductSyncMetadata(currentQueueItem.entity_id, currentQueueItem.payload.updated_at, {
        sync_status: 'synced',
        sync_error: undefined,
        last_synced_at: syncedAt,
        remote_updated_at: remoteProduct.updated_at,
      });
      await mergeRemoteProductsIntoDexie([remoteProduct], syncedAt);
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

    if (remoteStockMutation && isRemoteStockMutationDto(currentQueueItem.payload)) {
      await markQueueItemSynced(currentQueueItem.id, syncedAt);
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

    if (remoteWarehouse && isRemoteWarehouseDto(currentQueueItem.payload)) {
      await markQueueItemSynced(currentQueueItem.id, syncedAt);
      await updateWarehouseSyncMetadata(currentQueueItem.entity_id, currentQueueItem.payload.updated_at, {
        sync_status: 'synced',
        sync_error: undefined,
        last_synced_at: syncedAt,
        remote_updated_at: remoteWarehouse.updated_at,
      });
      await mergeRemoteWarehousesIntoDexie([remoteWarehouse], syncedAt);
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

export const enqueueContactSync = async (
  contact: Contact,
  operation: SyncQueueOperation,
) => {
  const now = new Date().toISOString();
  const queueItem: SyncQueueItem = {
    id: crypto.randomUUID(),
    entity: CONTACT_ENTITY,
    entity_id: contact.id,
    operation,
    payload: mapContactToRemoteDto(contact),
    status: 'pending',
    attempts: 0,
    created_at: now,
    updated_at: now,
  };

  await db.syncQueue.add(queueItem);
  void processPendingSyncQueue();

  return queueItem;
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

export const enqueueProductSync = async (
  product: Product,
  operation: SyncQueueOperation,
) => {
  const now = new Date().toISOString();
  const queueItem: SyncQueueItem = {
    id: crypto.randomUUID(),
    entity: PRODUCT_ENTITY,
    entity_id: product.id,
    operation,
    payload: mapProductToRemoteDto(product),
    status: 'pending',
    attempts: 0,
    created_at: now,
    updated_at: now,
  };

  await db.syncQueue.add(queueItem);
  void processPendingSyncQueue();

  return queueItem;
};

export const enqueueStockMutationSync = async (mutation: StockMutation) => {
  const now = new Date().toISOString();
  const queueItem: SyncQueueItem = {
    id: crypto.randomUUID(),
    entity: STOCK_MUTATION_ENTITY,
    entity_id: mutation.id,
    operation: 'create',
    payload: mapStockMutationToRemoteDto(mutation),
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

export const enqueueWarehouseSync = async (
  warehouse: Warehouse,
  operation: SyncQueueOperation,
) => {
  const now = new Date().toISOString();
  const queueItem: SyncQueueItem = {
    id: crypto.randomUUID(),
    entity: WAREHOUSE_ENTITY,
    entity_id: warehouse.id,
    operation,
    payload: mapWarehouseToRemoteDto(warehouse),
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
