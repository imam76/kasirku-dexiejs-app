import { getCurrentSessionUser, requireUserPermission, writeActivityLog } from '@/auth/authService';
import { db } from '@/lib/db';
import { processPendingSyncQueue } from '@/services/syncQueueService';
import type { PosStockDiscrepancy, PosStockDiscrepancyStatus, SyncQueueItem } from '@/types';

export interface PosStockDiscrepancyFilters {
  status?: PosStockDiscrepancyStatus | 'ALL';
  productId?: string;
  cashierUserId?: string;
  deviceId?: string;
}

export interface ReviewPosStockDiscrepancyInput {
  id: string;
  status: Extract<PosStockDiscrepancyStatus, 'REVIEWED' | 'NEEDS_INVESTIGATION'>;
  investigationCause?: string;
  investigationNote?: string;
  stockOpnameId?: string;
}

const buildDiscrepancyQueueItem = (
  discrepancy: PosStockDiscrepancy,
  operation: 'create' | 'update',
  now: string,
): SyncQueueItem => ({
  id: crypto.randomUUID(),
  entity: 'posStockDiscrepancies',
  entity_id: discrepancy.id,
  operation,
  payload: discrepancy,
  status: 'pending',
  attempts: 0,
  created_at: now,
  updated_at: now,
});

export const listPosStockDiscrepancies = async (
  filters: PosStockDiscrepancyFilters = {},
) => {
  const rows = await db.posStockDiscrepancies.orderBy('created_at').reverse().toArray();
  return rows.filter((row) => (
    (!filters.status || filters.status === 'ALL' || row.status === filters.status)
    && (!filters.productId || row.product_id === filters.productId)
    && (!filters.cashierUserId || row.cashier_user_id === filters.cashierUserId)
    && (!filters.deviceId || row.device_id === filters.deviceId)
  ));
};

export const getCashierSessionDiscrepancySummary = async (cashierSessionId: string) => {
  const rows = await db.posStockDiscrepancies
    .where('cashier_session_id')
    .equals(cashierSessionId)
    .toArray();

  return {
    case_count: rows.length,
    pending_review_count: rows.filter((row) => row.status === 'PENDING_REVIEW').length,
    shortage_quantity: rows.reduce((sum, row) => sum + row.shortage_quantity, 0),
    products: [...new Set(rows.map((row) => row.product_name))].sort(),
  };
};

export const reviewPosStockDiscrepancy = async ({
  id,
  status,
  investigationCause,
  investigationNote,
  stockOpnameId,
}: ReviewPosStockDiscrepancyInput) => {
  const currentUser = await getCurrentSessionUser();
  await requireUserPermission(currentUser, 'POS_STOCK_DISCREPANCY_REVIEW');
  if (!currentUser) throw new Error('Sesi user tidak ditemukan.');

  const existing = await db.posStockDiscrepancies.get(id);
  if (!existing) throw new Error('Kasus selisih stok tidak ditemukan.');

  const cause = investigationCause?.trim() || undefined;
  const note = investigationNote?.trim() || undefined;
  if (status === 'REVIEWED' && !cause) {
    throw new Error('Hasil/penyebab investigasi wajib diisi untuk menyelesaikan review.');
  }

  const now = new Date().toISOString();
  const reviewed: PosStockDiscrepancy = {
    ...existing,
    status,
    reviewed_by: currentUser.id,
    reviewed_by_name: currentUser.name,
    reviewed_at: now,
    investigation_cause: cause,
    investigation_note: note,
    stock_opname_id: stockOpnameId?.trim() || undefined,
    updated_at: now,
    sync_status: 'pending',
    sync_error: undefined,
  };

  await db.transaction('rw', [db.posStockDiscrepancies, db.syncQueue], async () => {
    await db.posStockDiscrepancies.put(reviewed);
    await db.syncQueue.add(buildDiscrepancyQueueItem(reviewed, 'update', now));
  });

  await writeActivityLog({
    user: currentUser,
    action: status === 'REVIEWED'
      ? 'POS_STOCK_DISCREPANCY_REVIEWED'
      : 'POS_STOCK_DISCREPANCY_NEEDS_INVESTIGATION',
    entity: 'posStockDiscrepancies',
    entity_id: reviewed.id,
    description: `${currentUser.name} memperbarui kasus ${reviewed.product_name} menjadi ${status}.`,
  });
  void processPendingSyncQueue();
  return reviewed;
};
