import { createFileRoute } from '@tanstack/react-router';
import PurchaseDocumentsManagement from '@/view/finance/purchases/PurchaseDocumentsManagement';

export const Route = createFileRoute('/purchases/')({
  component: PurchaseDocumentsManagement,
});
