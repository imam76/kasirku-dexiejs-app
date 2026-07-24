import { createLazyFileRoute } from '@tanstack/react-router';
import CooperativeIptwReportManagement from '@/view/koperasi/reports/CooperativeIptwReportManagement';

export const Route = createLazyFileRoute('/koperasi/laporan/iptw')({
  component: CooperativeIptwReportManagement,
});
