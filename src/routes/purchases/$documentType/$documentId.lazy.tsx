import { createLazyFileRoute } from '@tanstack/react-router';
import PurchaseDocumentDetail from '@/view/purchases/PurchaseDocumentDetail';

export const Route = createLazyFileRoute('/purchases/$documentType/$documentId')({
  component: PurchaseDocumentDetailRoute,
});

function PurchaseDocumentDetailRoute() {
  const { documentId } = Route.useParams();
  return <PurchaseDocumentDetail documentId={documentId} />;
}
