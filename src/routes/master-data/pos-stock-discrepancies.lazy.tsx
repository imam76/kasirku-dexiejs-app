import { createLazyFileRoute } from '@tanstack/react-router';
import PosStockDiscrepancyInbox from '@/view/stock-discrepancy/PosStockDiscrepancyInbox';

export const Route = createLazyFileRoute('/master-data/pos-stock-discrepancies')({
  component: PosStockDiscrepancyInbox,
});
