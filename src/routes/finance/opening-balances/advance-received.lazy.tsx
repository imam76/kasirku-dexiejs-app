import { createLazyFileRoute } from '@tanstack/react-router';
import { OpeningBalanceDetailPage } from '@/view/finance/opening-balances/OpeningBalancesManagement';

export const Route = createLazyFileRoute('/finance/opening-balances/advance-received')({
  component: () => <OpeningBalanceDetailPage module="ADVANCE_RECEIVED" />,
});
