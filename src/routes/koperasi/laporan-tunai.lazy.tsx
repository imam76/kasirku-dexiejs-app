import { createLazyFileRoute } from '@tanstack/react-router';
import CooperativeCashReportManagement from '@/view/koperasi/reports/CooperativeCashReportManagement';

export const Route = createLazyFileRoute('/koperasi/laporan-tunai')({
  component: CooperativeCashReportManagement,
});
