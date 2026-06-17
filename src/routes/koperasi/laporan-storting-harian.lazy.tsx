import { createLazyFileRoute } from '@tanstack/react-router';
import CooperativeDailyStortingReportManagement from '@/view/koperasi/reports/CooperativeDailyStortingReportManagement';

export const Route = createLazyFileRoute('/koperasi/laporan-storting-harian')({
  component: CooperativeDailyStortingReportManagement,
});
