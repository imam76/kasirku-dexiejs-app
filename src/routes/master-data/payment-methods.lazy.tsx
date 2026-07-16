import { createLazyFileRoute } from '@tanstack/react-router';
import PaymentMethodManagement from '@/view/master-data/payment-methods/PaymentMethodManagement';

export const Route = createLazyFileRoute('/master-data/payment-methods')({
  component: PaymentMethodManagement,
});
