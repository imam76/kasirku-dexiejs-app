import { createLazyFileRoute } from '@tanstack/react-router';
import SalesReturnDetail from '@/view/finance/sales/returns/SalesReturnDetail';

export const Route = createLazyFileRoute('/sales/returns/$returnId')({
  component: SalesReturnDetailRoute,
});

function SalesReturnDetailRoute() {
  const { returnId } = Route.useParams();
  return <SalesReturnDetail returnId={returnId} />;
}
