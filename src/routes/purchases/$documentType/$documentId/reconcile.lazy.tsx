import { createLazyFileRoute } from '@tanstack/react-router';
import PurchaseReceiptCostReconciliation from '@/view/finance/purchases/PurchaseReceiptCostReconciliation';

export const Route = createLazyFileRoute('/purchases/$documentType/$documentId/reconcile')({
  component: PurchaseReceiptCostReconciliationRoute,
});

function PurchaseReceiptCostReconciliationRoute() {
  const { documentId } = Route.useParams();
  return <PurchaseReceiptCostReconciliation documentId={documentId} />;
}
