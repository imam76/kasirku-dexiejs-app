import { createLazyFileRoute } from '@tanstack/react-router';
import ChartOfAccountsManagement from '@/view/finance/chart-of-accounts/ChartOfAccountsManagement';

export const Route = createLazyFileRoute('/finance/chart-of-accounts')({
  component: ChartOfAccountsManagement,
});

