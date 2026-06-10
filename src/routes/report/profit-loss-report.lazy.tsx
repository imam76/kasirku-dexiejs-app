import { createLazyFileRoute } from '@tanstack/react-router';
import ProfitLossReport from '@/view/ProfitLossReport';

export const Route = createLazyFileRoute('/report/profit-loss-report')({
  component: ProfitLossReport,
});
