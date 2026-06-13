import { createLazyFileRoute } from '@tanstack/react-router';
import StockOpnameManagement from '@/view/stock-opname/StockOpnameManagement';

export const Route = createLazyFileRoute('/master-data/stock-opname')({
  component: StockOpnameManagement,
});
