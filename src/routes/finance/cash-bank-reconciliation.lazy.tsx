import { createLazyFileRoute } from '@tanstack/react-router';
import CashBankReconciliationManagement from '@/view/finance/CashBankReconciliationManagement';

export const Route = createLazyFileRoute('/finance/cash-bank-reconciliation')({
  component: CashBankReconciliationManagement,
});
