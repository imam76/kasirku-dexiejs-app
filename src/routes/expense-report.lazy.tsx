import { createLazyFileRoute } from '@tanstack/react-router';
import ExpenseReport from '@/view/ExpenseReport';

export const Route = createLazyFileRoute('/expense-report')({
  component: ExpenseReport,
});
