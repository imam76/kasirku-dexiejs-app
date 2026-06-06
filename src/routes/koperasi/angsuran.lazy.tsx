import { createLazyFileRoute } from '@tanstack/react-router';
import CooperativeInstallmentManagement from '@/view/koperasi/installments/CooperativeInstallmentManagement';

export const Route = createLazyFileRoute('/koperasi/angsuran')({
  component: CooperativeInstallmentManagement,
});
