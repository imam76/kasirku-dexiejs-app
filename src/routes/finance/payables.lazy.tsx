import { createLazyFileRoute } from '@tanstack/react-router';
import AccountsPayableManagement from '@/view/finance/payables/AccountsPayableManagement';

export const Route = createLazyFileRoute('/finance/payables')({
  component: AccountsPayableManagement,
});
