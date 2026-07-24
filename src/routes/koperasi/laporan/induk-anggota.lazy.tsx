import { createLazyFileRoute } from '@tanstack/react-router';
import CooperativeMemberRegisterReportManagement from '@/view/koperasi/reports/CooperativeMemberRegisterReportManagement';

export const Route = createLazyFileRoute('/koperasi/laporan/induk-anggota')({
  component: CooperativeMemberRegisterReportManagement,
});
