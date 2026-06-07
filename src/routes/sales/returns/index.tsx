import { createFileRoute } from '@tanstack/react-router';
import SalesReturnsManagement from '@/view/sales/returns/SalesReturnsManagement';

export const Route = createFileRoute('/sales/returns/')({
  component: SalesReturnsManagement,
});
