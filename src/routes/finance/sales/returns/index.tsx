import { createFileRoute } from '@tanstack/react-router';
import SalesReturnsManagement from '@/view/sales/returns/SalesReturnsManagement';

export const Route = createFileRoute('/finance/sales/returns/')({
  component: SalesReturnsManagement,
});
