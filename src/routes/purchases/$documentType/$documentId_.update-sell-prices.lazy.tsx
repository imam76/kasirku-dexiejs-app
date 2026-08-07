import { createLazyFileRoute } from '@tanstack/react-router';
import PurchaseInvoiceSellPriceUpdate from '@/view/finance/purchases/PurchaseInvoiceSellPriceUpdate';

export const Route = createLazyFileRoute('/purchases/$documentType/$documentId_/update-sell-prices')({
  component: PurchaseInvoiceSellPriceUpdateRoute,
});

function PurchaseInvoiceSellPriceUpdateRoute() {
  const { documentId } = Route.useParams();
  return <PurchaseInvoiceSellPriceUpdate documentId={documentId} />;
}
