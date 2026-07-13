import { createLazyFileRoute } from '@tanstack/react-router';
import CashFlowReport from '@/view/CashFlowReport';

export const Route = createLazyFileRoute('/report/cash-flow-report')({
  component: CashFlowReport,
});
