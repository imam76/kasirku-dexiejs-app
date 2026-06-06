import { createLazyFileRoute } from '@tanstack/react-router';
import CooperativeSavingManagement from '@/view/koperasi/savings/CooperativeSavingManagement';

export const Route = createLazyFileRoute('/koperasi/simpanan')({
  component: CooperativeSavingManagement,
});
