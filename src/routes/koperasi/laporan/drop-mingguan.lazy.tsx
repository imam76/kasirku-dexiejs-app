import { createLazyFileRoute } from '@tanstack/react-router';
import CooperativeWeeklyEmployeeDropReportManagement from '@/view/koperasi/reports/CooperativeWeeklyEmployeeDropReportManagement';

export const Route = createLazyFileRoute('/koperasi/laporan/drop-mingguan')({
  component: CooperativeWeeklyEmployeeDropReportManagement,
});
