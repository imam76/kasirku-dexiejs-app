import { createLazyFileRoute } from '@tanstack/react-router';
import CooperativeDailyTargetReportManagement from '@/view/koperasi/reports/CooperativeDailyTargetReportManagement';

export const Route = createLazyFileRoute('/koperasi/laporan/target-harian')({
  component: CooperativeDailyTargetReportManagement,
});
