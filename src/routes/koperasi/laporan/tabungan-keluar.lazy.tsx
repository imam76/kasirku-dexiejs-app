import { createLazyFileRoute } from '@tanstack/react-router';
import CooperativeSavingMovementReportManagement from '@/view/koperasi/reports/CooperativeSavingMovementReportManagement';

export const Route = createLazyFileRoute('/koperasi/laporan/tabungan-keluar')({
  component: () => <CooperativeSavingMovementReportManagement direction="OUT" />,
});
