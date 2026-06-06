import { createLazyFileRoute } from '@tanstack/react-router';
import CooperativeReportManagement from '@/view/koperasi/reports/CooperativeReportManagement';

export const Route = createLazyFileRoute('/koperasi/laporan')({
  component: CooperativeReportManagement,
});
