import { createLazyFileRoute } from '@tanstack/react-router';
import SalesReturnDetail from '@/view/sales/returns/SalesReturnDetail';

export const Route = createLazyFileRoute('/finance/sales/returns/$returnId')({
  component: SalesReturnDetailRoute,
});

function SalesReturnDetailRoute() {
  const { returnId } = Route.useParams();
  return <SalesReturnDetail returnId={returnId} />;
}
