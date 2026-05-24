import { createFileRoute } from '@tanstack/react-router';
import SalesDocumentsManagement from '@/view/finance/sales/SalesDocumentsManagement';

export const Route = createFileRoute('/finance/sales/')({
  component: SalesDocumentsManagement,
});
