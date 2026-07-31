import { createLazyFileRoute } from '@tanstack/react-router';
import OpeningInventoryBalancePage from '@/view/finance/opening-balances/OpeningInventoryBalancePage';

export const Route = createLazyFileRoute('/finance/opening-balances/inventory')({
  component: OpeningInventoryBalancePage,
});
