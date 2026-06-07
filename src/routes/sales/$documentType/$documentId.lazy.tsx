import { createLazyFileRoute } from '@tanstack/react-router';
import SalesDocumentDetail from '@/view/sales/SalesDocumentDetail';

export const Route = createLazyFileRoute('/sales/$documentType/$documentId')({
  component: SalesDocumentDetailRoute,
});

function SalesDocumentDetailRoute() {
  const { documentId } = Route.useParams();
  return <SalesDocumentDetail documentId={documentId} />;
}
