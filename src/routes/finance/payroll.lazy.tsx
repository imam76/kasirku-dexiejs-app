import { createLazyFileRoute } from '@tanstack/react-router';
import PayrollManagement from '@/view/finance/payroll/PayrollManagement';

export const Route = createLazyFileRoute('/finance/payroll')({
  component: PayrollManagement,
});
