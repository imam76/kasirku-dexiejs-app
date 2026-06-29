import { createLazyFileRoute } from '@tanstack/react-router';
import IncomeReport from '@/view/IncomeReport';

export const Route = createLazyFileRoute('/report/income-report')({
  component: IncomeReport,
});
