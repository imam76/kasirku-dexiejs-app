import { createLazyFileRoute } from '@tanstack/react-router';
import AccountsReceivableManagement from '@/view/finance/receivables/AccountsReceivableManagement';

export const Route = createLazyFileRoute('/finance/receivables')({
  component: AccountsReceivableManagement,
});
