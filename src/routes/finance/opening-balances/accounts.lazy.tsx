import { createLazyFileRoute } from '@tanstack/react-router';
import { OpeningBalanceAccountsPage } from '@/view/finance/opening-balances/OpeningBalancesManagement';

export const Route = createLazyFileRoute('/finance/opening-balances/accounts')({
  component: OpeningBalanceAccountsPage,
});
