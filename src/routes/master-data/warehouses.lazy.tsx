import { createLazyFileRoute } from '@tanstack/react-router';
import WarehouseManagement from '@/view/master-data/warehouses/WarehouseManagement';

export const Route = createLazyFileRoute('/master-data/warehouses')({
  component: WarehouseManagement,
});
