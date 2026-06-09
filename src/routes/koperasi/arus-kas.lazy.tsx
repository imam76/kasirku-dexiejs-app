import { createLazyFileRoute } from '@tanstack/react-router';
import CooperativeCashFlowReportManagement from '@/view/koperasi/reports/CooperativeCashFlowReportManagement';

export const Route = createLazyFileRoute('/koperasi/arus-kas')({
  component: CooperativeCashFlowReportManagement,
});
