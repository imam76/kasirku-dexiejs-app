import { createLazyFileRoute } from '@tanstack/react-router';
import CooperativeInstallmentBookReportManagement from '@/view/koperasi/reports/CooperativeInstallmentBookReportManagement';

export const Route = createLazyFileRoute('/koperasi/laporan/buku-angsuran')({
  component: CooperativeInstallmentBookReportManagement,
});
