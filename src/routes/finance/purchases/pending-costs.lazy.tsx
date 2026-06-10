import { createLazyFileRoute } from '@tanstack/react-router';
import PendingPurchaseCosts from '@/view/finance/purchases/PendingPurchaseCosts';

export const Route = createLazyFileRoute('/finance/purchases/pending-costs')({
  component: PendingPurchaseCosts,
});
