import { createLazyFileRoute } from '@tanstack/react-router';
import CooperativeFieldCashManagement from '@/view/koperasi/field-cash/CooperativeFieldCashManagement';

export const Route = createLazyFileRoute('/koperasi/kas-petugas')({
  component: CooperativeFieldCashManagement,
});
