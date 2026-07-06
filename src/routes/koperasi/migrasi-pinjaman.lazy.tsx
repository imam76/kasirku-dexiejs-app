import { createLazyFileRoute } from '@tanstack/react-router';
import CooperativeLoanMigrationManagement from '@/view/koperasi/loans/CooperativeLoanMigrationManagement';

export const Route = createLazyFileRoute('/koperasi/migrasi-pinjaman')({
  component: CooperativeLoanMigrationManagement,
});
