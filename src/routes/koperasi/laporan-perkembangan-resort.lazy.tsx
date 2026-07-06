import { createLazyFileRoute } from '@tanstack/react-router';
import CooperativeResortDevelopmentReportManagement from '@/view/koperasi/reports/CooperativeResortDevelopmentReportManagement';

export const Route = createLazyFileRoute('/koperasi/laporan-perkembangan-resort')({
  component: CooperativeResortDevelopmentReportManagement,
});
