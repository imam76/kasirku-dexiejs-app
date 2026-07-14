import { createLazyFileRoute } from '@tanstack/react-router';
import { OpeningBalanceDetailPage } from '@/view/finance/opening-balances/OpeningBalancesManagement';

export const Route = createLazyFileRoute('/finance/opening-balances/receivables')({
  component: () => <OpeningBalanceDetailPage module="RECEIVABLE" />,
});
