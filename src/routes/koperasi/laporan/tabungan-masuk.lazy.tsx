import { createLazyFileRoute } from '@tanstack/react-router';
import CooperativeSavingMovementReportManagement from '@/view/koperasi/reports/CooperativeSavingMovementReportManagement';

export const Route = createLazyFileRoute('/koperasi/laporan/tabungan-masuk')({
  component: () => <CooperativeSavingMovementReportManagement direction="IN" />,
});
