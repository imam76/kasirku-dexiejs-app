import { createLazyFileRoute } from '@tanstack/react-router';
import InventoryReport from '@/view/InventoryReport';

export const Route = createLazyFileRoute('/report/inventory-report')({
  component: InventoryReport,
});
