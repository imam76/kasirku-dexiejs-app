import { createLazyFileRoute } from '@tanstack/react-router';
import CooperativeVoluntarySavingReportManagement from '@/view/koperasi/reports/CooperativeVoluntarySavingReportManagement';

export const Route = createLazyFileRoute('/koperasi/laporan/simpanan-sukarela')({
  component: CooperativeVoluntarySavingReportManagement,
});
