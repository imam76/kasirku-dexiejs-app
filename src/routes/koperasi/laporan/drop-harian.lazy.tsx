import { createLazyFileRoute } from '@tanstack/react-router';
import CooperativeDailyDropReportManagement from '@/view/koperasi/reports/CooperativeDailyDropReportManagement';

export const Route = createLazyFileRoute('/koperasi/laporan/drop-harian')({
  component: CooperativeDailyDropReportManagement,
});
