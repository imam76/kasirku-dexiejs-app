import { createLazyFileRoute } from '@tanstack/react-router';
import CooperativeLoanManagement from '@/view/koperasi/loans/CooperativeLoanManagement';

export const Route = createLazyFileRoute('/koperasi/pinjaman')({
  component: CooperativeLoanManagement,
});
