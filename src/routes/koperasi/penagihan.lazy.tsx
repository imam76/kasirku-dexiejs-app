import { createLazyFileRoute } from '@tanstack/react-router';
import CooperativeBillingManagement from '@/view/koperasi/billing/CooperativeBillingManagement';

export const Route = createLazyFileRoute('/koperasi/penagihan')({
  component: CooperativeBillingManagement,
});
