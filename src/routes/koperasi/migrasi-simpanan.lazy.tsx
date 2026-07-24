import { createLazyFileRoute } from '@tanstack/react-router';
import CooperativeSavingOpeningBalanceManagement from '@/view/koperasi/savings/CooperativeSavingOpeningBalanceManagement';

export const Route = createLazyFileRoute('/koperasi/migrasi-simpanan')({
  component: CooperativeSavingOpeningBalanceManagement,
});
