import { createFileRoute } from '@tanstack/react-router';
import PurchaseDocumentsManagement from '@/view/purchases/PurchaseDocumentsManagement';

export const Route = createFileRoute('/purchases/')({
  component: PurchaseDocumentsManagement,
});
