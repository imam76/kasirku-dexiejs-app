import { getCurrentSessionUser, requireUserPermission } from '@/auth/authService';
import { db } from '@/lib/db';
import { accumulateInventoryLot, buildInventoryReportRows, type InventoryLotSummary } from '@/utils/inventory/inventoryReport';

export const getInventoryReport = async () => {
  await requireUserPermission(await getCurrentSessionUser({ touchSession: false, cleanupInvalidSession: false }), 'REPORT_INVENTORY_VIEW');
  return db.transaction('r', db.products, db.inventoryLots, async () => {
    const summaries = new Map<string, InventoryLotSummary>();
    const [products] = await Promise.all([
      db.products.toArray(),
      // Aggregate in one pass without materializing the full lot history.
      db.inventoryLots.each((lot) => accumulateInventoryLot(summaries, lot)),
    ]);
    return { rows: buildInventoryReportRows(products, summaries), generatedAt: new Date().toISOString() };
  });
};
