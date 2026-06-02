import { db } from '@/lib/db';
import { mergeRemoteAuthUsersIntoDexie } from '@/auth/authReadService';
import { mergeRemoteContactsIntoDexie } from '@/services/contactReadService';
import { mergeRemoteDepartmentsIntoDexie } from '@/services/departmentReadService';
import { mergeRemoteProductsIntoDexie } from '@/services/productReadService';
import { mergeRemotePurchaseDocumentBundlesIntoDexie } from '@/services/purchaseDocumentReadService';
import { mergeRemoteProjectsIntoDexie } from '@/services/projectReadService';
import { mergeRemoteSalesDocumentBundlesIntoDexie } from '@/services/salesDocumentReadService';
import { mergeRemoteTaxesIntoDexie } from '@/services/taxReadService';
import { mergeRemoteWarehousesIntoDexie } from '@/services/warehouseReadService';
import {
  activityLogPostgresAdapter,
  authUserPostgresAdapter,
  contactPostgresAdapter,
  departmentPostgresAdapter,
  isTauriRuntime,
  productPostgresAdapter,
  purchaseDocumentPostgresAdapter,
  projectPostgresAdapter,
  salesDocumentPostgresAdapter,
  stockMutationPostgresAdapter,
  taxPostgresAdapter,
  warehousePostgresAdapter,
  type RemoteActivityLogDto,
  type RemoteAuthUserDto,
  type RemoteContactDto,
  type RemoteDepartmentDto,
  type RemoteProductDto,
  type RemotePurchaseDocumentBundleDto,
  type RemotePurchaseDocumentDto,
  type RemotePurchaseDocumentItemDto,
  type RemoteProjectDto,
  type RemoteSalesDocumentBundleDto,
  type RemoteSalesDocumentDto,
  type RemoteSalesDocumentItemDto,
  type RemoteStockMutationDto,
  type RemoteTaxDto,
  type RemoteWarehouseDto,
} from '@/services/postgresAdapter';
import type { ActivityLog, AuthUser, Contact, Department, Product, Project, PurchaseDocument, PurchaseDocumentItem, SalesDocument, SalesDocumentItem, StockMutation, SyncQueueItem, SyncQueueOperation, Tax, Warehouse } from '@/types';

const SYNC_QUEUE_BATCH_SIZE = 20;
const ACTIVITY_LOG_ENTITY = 'activityLogs';
const AUTH_USER_ENTITY = 'authUsers';
const CONTACT_ENTITY = 'contacts';
const DEPARTMENT_ENTITY = 'departments';
const PRODUCT_ENTITY = 'products';
const PROJECT_ENTITY = 'projects';
const PURCHASE_DOCUMENT_ENTITY = 'purchaseDocuments';
const SALES_DOCUMENT_ENTITY = 'salesDocuments';
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

const mapActivityLogToRemoteDto = (log: ActivityLog): RemoteActivityLogDto => ({
  id: log.id,
  user_id: log.user_id,
  user_name: log.user_name,
  role: log.role,
  action: log.action,
  entity: log.entity,
  entity_id: log.entity_id,
  description: log.description,
  created_at: log.created_at,
});

const mapAuthUserToRemoteDto = (user: AuthUser): RemoteAuthUserDto => ({
  id: user.id,
  name: user.name,
  role: user.role,
  pin_hash: user.pin_hash,
  pin_salt: user.pin_salt,
  is_active: user.is_active,
  created_at: user.created_at,
  updated_at: user.updated_at,
});

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

const mapSalesDocumentToRemoteDto = (document: SalesDocument): RemoteSalesDocumentDto => ({
  id: document.id,
  document_number: document.document_number,
  type: document.type,
  status: document.status,
  contact_id: document.contact_id,
  customer_name: document.customer_name,
  customer_phone: document.customer_phone,
  customer_email: document.customer_email,
  customer_address: document.customer_address,
  customer_company_name: document.customer_company_name,
  customer_tax_number: document.customer_tax_number,
  department_id: document.department_id,
  department_code: document.department_code,
  department_name: document.department_name,
  project_id: document.project_id,
  project_code: document.project_code,
  project_name: document.project_name,
  document_date: document.document_date,
  expired_at: document.expired_at,
  due_date: document.due_date,
  warehouse_id: document.warehouse_id,
  warehouse_code: document.warehouse_code,
  warehouse_name: document.warehouse_name,
  source_document_id: document.source_document_id,
  source_document_number: document.source_document_number,
  source_document_type: document.source_document_type,
  subtotal_amount: document.subtotal_amount,
  discount_type: document.discount_type,
  discount_value: document.discount_value,
  discount_amount: document.discount_amount,
  discount_account_id: document.discount_account_id,
  discount_account_code: document.discount_account_code,
  discount_account_name: document.discount_account_name,
  tax_id: document.tax_id,
  tax_name: document.tax_name,
  tax_code: document.tax_code,
  tax_rate: document.tax_rate,
  tax_calculation_mode: document.tax_calculation_mode,
  tax_amount: document.tax_amount,
  total_amount: document.total_amount,
  payment_status: document.payment_status,
  paid_amount: document.paid_amount,
  paid_at: document.paid_at,
  payment_method: document.payment_method,
  cash_account_id: document.cash_account_id,
  cash_account_code: document.cash_account_code,
  cash_account_name: document.cash_account_name,
  finance_transaction_id: document.finance_transaction_id,
  notes: document.notes,
  issued_at: document.issued_at,
  voided_at: document.voided_at,
  void_reason: document.void_reason,
  version: document.version ?? 1,
  created_by: document.created_by,
  created_by_name: document.created_by_name,
  updated_by: document.updated_by,
  updated_by_name: document.updated_by_name,
  created_at: document.created_at,
  updated_at: document.updated_at,
});

const mapSalesDocumentItemToRemoteDto = (item: SalesDocumentItem): RemoteSalesDocumentItemDto => ({
  id: item.id,
  document_id: item.document_id,
  product_id: item.product_id,
  product_name: item.product_name,
  sku: item.sku,
  unit: item.unit,
  quantity: item.quantity,
  ordered_quantity: item.ordered_quantity,
  delivered_quantity: item.delivered_quantity,
  price: item.price,
  discount_type: item.discount_type,
  discount_value: item.discount_value,
  discount_amount: item.discount_amount,
  tax_id: item.tax_id,
  tax_name: item.tax_name,
  tax_code: item.tax_code,
  tax_rate: item.tax_rate,
  tax_calculation_mode: item.tax_calculation_mode,
  tax_base_amount: item.tax_base_amount,
  tax_amount: item.tax_amount,
  subtotal: item.subtotal,
  total_amount: item.total_amount,
  purchase_price: item.purchase_price,
  original_price: item.original_price,
  is_price_edited: item.is_price_edited,
  price_edited_by: item.price_edited_by,
  price_edited_at: item.price_edited_at,
  created_at: item.created_at,
});

const mapSalesDocumentBundleToRemoteDto = (
  document: SalesDocument,
  items: SalesDocumentItem[],
): RemoteSalesDocumentBundleDto => ({
  document: mapSalesDocumentToRemoteDto(document),
  items: items.map(mapSalesDocumentItemToRemoteDto),
});

const mapPurchaseDocumentToRemoteDto = (document: PurchaseDocument): RemotePurchaseDocumentDto => ({
  id: document.id,
  document_number: document.document_number,
  type: document.type,
  status: document.status,
  contact_id: document.contact_id,
  supplier_name: document.supplier_name ?? '',
  supplier_phone: document.supplier_phone,
  supplier_email: document.supplier_email,
  supplier_address: document.supplier_address,
  supplier_company_name: document.supplier_company_name,
  supplier_tax_number: document.supplier_tax_number,
  department_id: document.department_id,
  department_code: document.department_code,
  department_name: document.department_name,
  project_id: document.project_id,
  project_code: document.project_code,
  project_name: document.project_name,
  document_date: document.document_date,
  required_date: document.required_date,
  quotation_due_date: document.quotation_due_date,
  due_date: document.due_date,
  warehouse_id: document.warehouse_id,
  warehouse_code: document.warehouse_code,
  warehouse_name: document.warehouse_name,
  source_document_id: document.source_document_id,
  source_document_number: document.source_document_number,
  source_document_type: document.source_document_type,
  subtotal_amount: document.subtotal_amount,
  discount_type: document.discount_type,
  discount_value: document.discount_value,
  discount_amount: document.discount_amount,
  discount_account_id: document.discount_account_id,
  discount_account_code: document.discount_account_code,
  discount_account_name: document.discount_account_name,
  tax_id: document.tax_id,
  tax_name: document.tax_name,
  tax_code: document.tax_code,
  tax_rate: document.tax_rate,
  tax_calculation_mode: document.tax_calculation_mode,
  tax_amount: document.tax_amount,
  total_amount: document.total_amount,
  payment_status: document.payment_status,
  paid_amount: document.paid_amount,
  paid_at: document.paid_at,
  payment_method: document.payment_method,
  cash_account_id: document.cash_account_id,
  cash_account_code: document.cash_account_code,
  cash_account_name: document.cash_account_name,
  finance_transaction_id: document.finance_transaction_id,
  notes: document.notes,
  issued_at: document.issued_at,
  voided_at: document.voided_at,
  void_reason: document.void_reason,
  version: document.version ?? 1,
  created_by: document.created_by,
  created_by_name: document.created_by_name,
  updated_by: document.updated_by,
  updated_by_name: document.updated_by_name,
  created_at: document.created_at,
  updated_at: document.updated_at,
});

const mapPurchaseDocumentItemToRemoteDto = (item: PurchaseDocumentItem): RemotePurchaseDocumentItemDto => ({
  id: item.id,
  document_id: item.document_id,
  product_id: item.product_id,
  product_name: item.product_name,
  sku: item.sku,
  unit: item.unit,
  quantity: item.quantity,
  ordered_quantity: item.ordered_quantity,
  received_quantity: item.received_quantity,
  price: item.price,
  discount_type: item.discount_type,
  discount_value: item.discount_value,
  discount_amount: item.discount_amount,
  tax_id: item.tax_id,
  tax_name: item.tax_name,
  tax_code: item.tax_code,
  tax_rate: item.tax_rate,
  tax_calculation_mode: item.tax_calculation_mode,
  tax_base_amount: item.tax_base_amount,
  tax_amount: item.tax_amount,
  subtotal: item.subtotal,
  total_amount: item.total_amount,
  created_at: item.created_at,
});

const mapPurchaseDocumentBundleToRemoteDto = (
  document: PurchaseDocument,
  items: PurchaseDocumentItem[],
): RemotePurchaseDocumentBundleDto => ({
  document: mapPurchaseDocumentToRemoteDto(document),
  items: items.map(mapPurchaseDocumentItemToRemoteDto),
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

const isRemoteActivityLogDto = (payload: unknown): payload is RemoteActivityLogDto => {
  if (!payload || typeof payload !== 'object') return false;

  const candidate = payload as Partial<RemoteActivityLogDto>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.action === 'string' &&
    typeof candidate.entity === 'string' &&
    typeof candidate.description === 'string' &&
    typeof candidate.created_at === 'string'
  );
};

const isRemoteAuthUserDto = (payload: unknown): payload is RemoteAuthUserDto => {
  if (!payload || typeof payload !== 'object') return false;

  const candidate = payload as Partial<RemoteAuthUserDto>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.name === 'string' &&
    typeof candidate.role === 'string' &&
    typeof candidate.pin_hash === 'string' &&
    typeof candidate.pin_salt === 'string' &&
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

const isRemoteSalesDocumentDto = (payload: unknown): payload is RemoteSalesDocumentDto => {
  if (!payload || typeof payload !== 'object') return false;

  const candidate = payload as Partial<RemoteSalesDocumentDto>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.document_number === 'string' &&
    typeof candidate.type === 'string' &&
    typeof candidate.status === 'string' &&
    typeof candidate.customer_name === 'string' &&
    typeof candidate.document_date === 'string' &&
    typeof candidate.version === 'number' &&
    typeof candidate.created_at === 'string' &&
    typeof candidate.updated_at === 'string'
  );
};

const isRemoteSalesDocumentItemDto = (payload: unknown): payload is RemoteSalesDocumentItemDto => {
  if (!payload || typeof payload !== 'object') return false;

  const candidate = payload as Partial<RemoteSalesDocumentItemDto>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.document_id === 'string' &&
    typeof candidate.product_id === 'string' &&
    typeof candidate.product_name === 'string' &&
    typeof candidate.unit === 'string' &&
    typeof candidate.quantity === 'number' &&
    typeof candidate.created_at === 'string'
  );
};

const isRemoteSalesDocumentBundleDto = (
  payload: unknown,
): payload is RemoteSalesDocumentBundleDto => {
  if (!payload || typeof payload !== 'object') return false;

  const candidate = payload as Partial<RemoteSalesDocumentBundleDto>;
  return (
    isRemoteSalesDocumentDto(candidate.document) &&
    Array.isArray(candidate.items) &&
    candidate.items.every(isRemoteSalesDocumentItemDto)
  );
};

const isRemotePurchaseDocumentDto = (payload: unknown): payload is RemotePurchaseDocumentDto => {
  if (!payload || typeof payload !== 'object') return false;

  const candidate = payload as Partial<RemotePurchaseDocumentDto>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.document_number === 'string' &&
    typeof candidate.type === 'string' &&
    typeof candidate.status === 'string' &&
    typeof candidate.supplier_name === 'string' &&
    typeof candidate.document_date === 'string' &&
    typeof candidate.version === 'number' &&
    typeof candidate.created_at === 'string' &&
    typeof candidate.updated_at === 'string'
  );
};

const isRemotePurchaseDocumentItemDto = (payload: unknown): payload is RemotePurchaseDocumentItemDto => {
  if (!payload || typeof payload !== 'object') return false;

  const candidate = payload as Partial<RemotePurchaseDocumentItemDto>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.document_id === 'string' &&
    typeof candidate.product_id === 'string' &&
    typeof candidate.product_name === 'string' &&
    typeof candidate.unit === 'string' &&
    typeof candidate.quantity === 'number' &&
    typeof candidate.created_at === 'string'
  );
};

const isRemotePurchaseDocumentBundleDto = (
  payload: unknown,
): payload is RemotePurchaseDocumentBundleDto => {
  if (!payload || typeof payload !== 'object') return false;

  const candidate = payload as Partial<RemotePurchaseDocumentBundleDto>;
  return (
    isRemotePurchaseDocumentDto(candidate.document) &&
    Array.isArray(candidate.items) &&
    candidate.items.every(isRemotePurchaseDocumentItemDto)
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

const updateAuthUserSyncMetadata = async (
  userId: string,
  sourceUpdatedAt: string,
  syncMetadata: Partial<Pick<AuthUser, 'sync_status' | 'sync_error' | 'last_synced_at' | 'remote_updated_at'>>,
) => {
  const currentUser = await db.authUsers.get(userId);
  if (!currentUser || currentUser.updated_at !== sourceUpdatedAt) return;

  await db.authUsers.update(userId, syncMetadata);
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

const updatePurchaseDocumentSyncMetadata = async (
  documentId: string,
  sourceUpdatedAt: string,
  syncMetadata: Partial<Pick<PurchaseDocument, 'sync_status' | 'sync_error' | 'last_synced_at' | 'remote_updated_at'>>,
) => {
  const currentDocument = await db.purchaseDocuments.get(documentId);
  if (!currentDocument || currentDocument.updated_at !== sourceUpdatedAt) return;

  await db.purchaseDocuments.update(documentId, syncMetadata);
};

const updateSalesDocumentSyncMetadata = async (
  documentId: string,
  sourceUpdatedAt: string,
  syncMetadata: Partial<Pick<SalesDocument, 'sync_status' | 'sync_error' | 'last_synced_at' | 'remote_updated_at'>>,
) => {
  const currentDocument = await db.salesDocuments.get(documentId);
  if (!currentDocument || currentDocument.updated_at !== sourceUpdatedAt) return;

  await db.salesDocuments.update(documentId, syncMetadata);
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

  if (queueItem.entity === AUTH_USER_ENTITY && isRemoteAuthUserDto(queueItem.payload)) {
    await updateAuthUserSyncMetadata(queueItem.entity_id, queueItem.payload.updated_at, {
      sync_status: 'failed',
      sync_error: errorMessage,
    });
  }

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

  if (queueItem.entity === PURCHASE_DOCUMENT_ENTITY && isRemotePurchaseDocumentBundleDto(queueItem.payload)) {
    await updatePurchaseDocumentSyncMetadata(queueItem.entity_id, queueItem.payload.document.updated_at, {
      sync_status: 'failed',
      sync_error: errorMessage,
    });
  }

  if (queueItem.entity === SALES_DOCUMENT_ENTITY && isRemoteSalesDocumentBundleDto(queueItem.payload)) {
    await updateSalesDocumentSyncMetadata(queueItem.entity_id, queueItem.payload.document.updated_at, {
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

const processActivityLogQueueItem = async (queueItem: SyncQueueItem) => {
  if (queueItem.operation === 'delete') {
    throw new Error('Activity log sync queue tidak mendukung operasi delete.');
  }

  if (!isRemoteActivityLogDto(queueItem.payload)) {
    throw new Error('Payload activity log sync queue tidak valid.');
  }

  return activityLogPostgresAdapter.upsert(queueItem.payload);
};

const processAuthUserQueueItem = async (queueItem: SyncQueueItem) => {
  if (queueItem.operation === 'delete') {
    throw new Error('Auth user sync queue tidak mendukung operasi delete.');
  }

  if (!isRemoteAuthUserDto(queueItem.payload)) {
    throw new Error('Payload auth user sync queue tidak valid.');
  }

  return authUserPostgresAdapter.upsert(queueItem.payload);
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

const processPurchaseDocumentQueueItem = async (queueItem: SyncQueueItem) => {
  if (queueItem.operation === 'delete') {
    throw new Error('Purchase document sync queue tidak mendukung operasi delete.');
  }

  if (!isRemotePurchaseDocumentBundleDto(queueItem.payload)) {
    throw new Error('Payload purchase document sync queue tidak valid.');
  }

  return purchaseDocumentPostgresAdapter.upsert(queueItem.payload);
};

const processSalesDocumentQueueItem = async (queueItem: SyncQueueItem) => {
  if (queueItem.operation === 'delete') {
    throw new Error('Sales document sync queue tidak mendukung operasi delete.');
  }

  if (!isRemoteSalesDocumentBundleDto(queueItem.payload)) {
    throw new Error('Payload sales document sync queue tidak valid.');
  }

  return salesDocumentPostgresAdapter.upsert(queueItem.payload);
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
    let remoteActivityLog: RemoteActivityLogDto | null = null;
    let remoteAuthUser: RemoteAuthUserDto | null = null;
    let remoteContact: RemoteContactDto | null = null;
    let remoteDepartment: RemoteDepartmentDto | null = null;
    let remoteProduct: RemoteProductDto | null = null;
    let remoteProject: RemoteProjectDto | null = null;
    let remotePurchaseDocumentBundle: RemotePurchaseDocumentBundleDto | null = null;
    let remoteSalesDocumentBundle: RemoteSalesDocumentBundleDto | null = null;
    let remoteStockMutation: RemoteStockMutationDto | null = null;
    let remoteTax: RemoteTaxDto | null = null;
    let remoteWarehouse: RemoteWarehouseDto | null = null;

    if (currentQueueItem.entity === ACTIVITY_LOG_ENTITY) {
      remoteActivityLog = await processActivityLogQueueItem(currentQueueItem);
    } else if (currentQueueItem.entity === AUTH_USER_ENTITY) {
      remoteAuthUser = await processAuthUserQueueItem(currentQueueItem);
    } else if (currentQueueItem.entity === CONTACT_ENTITY) {
      remoteContact = await processContactQueueItem(currentQueueItem);
    } else if (currentQueueItem.entity === DEPARTMENT_ENTITY) {
      remoteDepartment = await processDepartmentQueueItem(currentQueueItem);
    } else if (currentQueueItem.entity === PRODUCT_ENTITY) {
      remoteProduct = await processProductQueueItem(currentQueueItem);
    } else if (currentQueueItem.entity === PROJECT_ENTITY) {
      remoteProject = await processProjectQueueItem(currentQueueItem);
    } else if (currentQueueItem.entity === PURCHASE_DOCUMENT_ENTITY) {
      remotePurchaseDocumentBundle = await processPurchaseDocumentQueueItem(currentQueueItem);
    } else if (currentQueueItem.entity === SALES_DOCUMENT_ENTITY) {
      remoteSalesDocumentBundle = await processSalesDocumentQueueItem(currentQueueItem);
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

    if (remoteActivityLog && isRemoteActivityLogDto(currentQueueItem.payload)) {
      await markQueueItemSynced(currentQueueItem.id, syncedAt);
      return;
    }

    if (remoteAuthUser && isRemoteAuthUserDto(currentQueueItem.payload)) {
      await markQueueItemSynced(currentQueueItem.id, syncedAt);
      await updateAuthUserSyncMetadata(currentQueueItem.entity_id, currentQueueItem.payload.updated_at, {
        sync_status: 'synced',
        sync_error: undefined,
        last_synced_at: syncedAt,
        remote_updated_at: remoteAuthUser.updated_at,
      });
      await mergeRemoteAuthUsersIntoDexie([remoteAuthUser], syncedAt);
      return;
    }

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

    if (remotePurchaseDocumentBundle && isRemotePurchaseDocumentBundleDto(currentQueueItem.payload)) {
      await markQueueItemSynced(currentQueueItem.id, syncedAt);
      await updatePurchaseDocumentSyncMetadata(currentQueueItem.entity_id, currentQueueItem.payload.document.updated_at, {
        sync_status: 'synced',
        sync_error: undefined,
        last_synced_at: syncedAt,
        remote_updated_at: remotePurchaseDocumentBundle.document.updated_at,
      });
      await mergeRemotePurchaseDocumentBundlesIntoDexie([remotePurchaseDocumentBundle], syncedAt);
      return;
    }

    if (remoteSalesDocumentBundle && isRemoteSalesDocumentBundleDto(currentQueueItem.payload)) {
      await markQueueItemSynced(currentQueueItem.id, syncedAt);
      await updateSalesDocumentSyncMetadata(currentQueueItem.entity_id, currentQueueItem.payload.document.updated_at, {
        sync_status: 'synced',
        sync_error: undefined,
        last_synced_at: syncedAt,
        remote_updated_at: remoteSalesDocumentBundle.document.updated_at,
      });
      await mergeRemoteSalesDocumentBundlesIntoDexie([remoteSalesDocumentBundle], syncedAt);
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

export const enqueueActivityLogSync = async (log: ActivityLog) => {
  const now = new Date().toISOString();
  const queueItem: SyncQueueItem = {
    id: crypto.randomUUID(),
    entity: ACTIVITY_LOG_ENTITY,
    entity_id: log.id,
    operation: 'create',
    payload: mapActivityLogToRemoteDto(log),
    status: 'pending',
    attempts: 0,
    created_at: now,
    updated_at: now,
  };

  await db.syncQueue.add(queueItem);
  void processPendingSyncQueue();

  return queueItem;
};

export const enqueueAuthUserSync = async (
  user: AuthUser,
  operation: Extract<SyncQueueOperation, 'create' | 'update'>,
) => {
  const now = new Date().toISOString();
  const queueItem: SyncQueueItem = {
    id: crypto.randomUUID(),
    entity: AUTH_USER_ENTITY,
    entity_id: user.id,
    operation,
    payload: mapAuthUserToRemoteDto(user),
    status: 'pending',
    attempts: 0,
    created_at: now,
    updated_at: now,
  };

  await db.syncQueue.add(queueItem);
  void processPendingSyncQueue();

  return queueItem;
};

export const enqueuePendingAuthUsersForSync = async () => {
  const authUsers = (await db.authUsers.toArray())
    .filter((user) => user.sync_status === 'pending' || user.sync_status === 'failed');

  for (const user of authUsers) {
    const existingQueueItem = (await db.syncQueue
      .where('entity')
      .equals(AUTH_USER_ENTITY)
      .toArray())
      .find((queueItem) => (
        queueItem.entity_id === user.id &&
        queueItem.status !== 'synced' &&
        isRemoteAuthUserDto(queueItem.payload) &&
        queueItem.payload.updated_at === user.updated_at
      ));

    if (!existingQueueItem) {
      await enqueueAuthUserSync(user, 'update');
    }
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

export const enqueueSalesDocumentBundleSync = async (
  document: SalesDocument,
  items: SalesDocumentItem[],
  operation: Extract<SyncQueueOperation, 'create' | 'update'>,
) => {
  const now = new Date().toISOString();
  const queueItem: SyncQueueItem = {
    id: crypto.randomUUID(),
    entity: SALES_DOCUMENT_ENTITY,
    entity_id: document.id,
    operation,
    payload: mapSalesDocumentBundleToRemoteDto(document, items),
    status: 'pending',
    attempts: 0,
    created_at: now,
    updated_at: now,
  };

  await db.syncQueue.add(queueItem);
  void processPendingSyncQueue();

  return queueItem;
};

export const enqueuePurchaseDocumentBundleSync = async (
  document: PurchaseDocument,
  items: PurchaseDocumentItem[],
  operation: Extract<SyncQueueOperation, 'create' | 'update'>,
) => {
  const now = new Date().toISOString();
  const queueItem: SyncQueueItem = {
    id: crypto.randomUUID(),
    entity: PURCHASE_DOCUMENT_ENTITY,
    entity_id: document.id,
    operation,
    payload: mapPurchaseDocumentBundleToRemoteDto(document, items),
    status: 'pending',
    attempts: 0,
    created_at: now,
    updated_at: now,
  };

  await db.syncQueue.add(queueItem);
  void processPendingSyncQueue();

  return queueItem;
};

export const enqueuePendingPurchaseDocumentsForSync = async () => {
  const purchaseDocuments = (await db.purchaseDocuments.toArray())
    .filter((document) => document.sync_status === 'pending' || document.sync_status === 'failed');

  const purchaseDocumentQueueItems = await db.syncQueue
    .where('entity')
    .equals(PURCHASE_DOCUMENT_ENTITY)
    .toArray();

  for (const document of purchaseDocuments) {
    const existingQueueItem = purchaseDocumentQueueItems.find((queueItem) => (
      queueItem.entity_id === document.id &&
      queueItem.status !== 'synced' &&
      isRemotePurchaseDocumentBundleDto(queueItem.payload) &&
      queueItem.payload.document.updated_at === document.updated_at &&
      queueItem.payload.document.version === (document.version ?? 1)
    ));

    if (!existingQueueItem) {
      const items = await db.purchaseDocumentItems.where('document_id').equals(document.id).toArray();
      await enqueuePurchaseDocumentBundleSync(document, items, 'update');
    }
  }
};

export const enqueuePendingSalesDocumentsForSync = async () => {
  const salesDocuments = (await db.salesDocuments.toArray())
    .filter((document) => document.sync_status === 'pending' || document.sync_status === 'failed');

  const salesDocumentQueueItems = await db.syncQueue
    .where('entity')
    .equals(SALES_DOCUMENT_ENTITY)
    .toArray();

  for (const document of salesDocuments) {
    const existingQueueItem = salesDocumentQueueItems.find((queueItem) => (
      queueItem.entity_id === document.id &&
      queueItem.status !== 'synced' &&
      isRemoteSalesDocumentBundleDto(queueItem.payload) &&
      queueItem.payload.document.updated_at === document.updated_at &&
      queueItem.payload.document.version === (document.version ?? 1)
    ));

    if (!existingQueueItem) {
      const items = await db.salesDocumentItems.where('document_id').equals(document.id).toArray();
      await enqueueSalesDocumentBundleSync(document, items, 'update');
    }
  }
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
