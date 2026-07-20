import { createLazyFileRoute } from '@tanstack/react-router';
import SalesOverpaymentManagement from '@/view/finance/receivables/SalesOverpaymentManagement';

export const Route = createLazyFileRoute('/finance/receivables/overpayments')({
  component: SalesOverpaymentManagement,
});
