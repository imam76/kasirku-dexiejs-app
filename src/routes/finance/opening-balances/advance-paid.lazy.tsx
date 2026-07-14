import { createLazyFileRoute } from '@tanstack/react-router';
import { OpeningBalanceDetailPage } from '@/view/finance/opening-balances/OpeningBalancesManagement';

export const Route = createLazyFileRoute('/finance/opening-balances/advance-paid')({
  component: () => <OpeningBalanceDetailPage module="ADVANCE_PAID" />,
});
