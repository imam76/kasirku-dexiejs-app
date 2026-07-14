import { createLazyFileRoute } from '@tanstack/react-router';
import OpeningBalancesManagement from '@/view/finance/opening-balances/OpeningBalancesManagement';

export const Route = createLazyFileRoute('/finance/opening-balances')({
  component: OpeningBalancesManagement,
});
