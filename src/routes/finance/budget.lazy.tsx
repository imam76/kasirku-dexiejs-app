import { createLazyFileRoute } from '@tanstack/react-router';
import BudgetManagement from '@/view/finance/budget/BudgetManagement';

export const Route = createLazyFileRoute('/finance/budget')({
  component: BudgetManagement,
});
