import { createLazyFileRoute } from '@tanstack/react-router';
import CooperativeDailyFieldCashReportManagement from '@/view/koperasi/reports/CooperativeDailyFieldCashReportManagement';

export const Route = createLazyFileRoute('/koperasi/laporan/kas-harian-pdl')({
  component: CooperativeDailyFieldCashReportManagement,
});
