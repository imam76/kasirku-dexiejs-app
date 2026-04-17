import { createLazyFileRoute } from '@tanstack/react-router';
import ExpenseReport from '@/view/ExpenseReport';

export const Route = createLazyFileRoute('/report/expense-report')({
  component: ExpenseReport,
});
