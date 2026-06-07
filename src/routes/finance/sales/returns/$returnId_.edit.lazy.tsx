import { createLazyFileRoute } from '@tanstack/react-router';
import SalesReturnEditor from '@/view/sales/returns/SalesReturnEditor';

export const Route = createLazyFileRoute('/finance/sales/returns/$returnId_/edit')({
  component: EditSalesReturnRoute,
});

function EditSalesReturnRoute() {
  const { returnId } = Route.useParams();
  return <SalesReturnEditor returnId={returnId} />;
}
