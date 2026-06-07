import { createLazyFileRoute } from '@tanstack/react-router';
import type { SalesReturnSourceType } from '@/types';
import SalesReturnEditor from '@/view/sales/returns/SalesReturnEditor';

const parseSourceType = (value: unknown): SalesReturnSourceType | undefined => (
  value === 'SALES_DELIVERY' || value === 'SALES_INVOICE' || value === 'POS_TRANSACTION'
    ? value
    : undefined
);

export const Route = createLazyFileRoute('/sales/returns/new')({
  component: NewSalesReturnRoute,
});

function NewSalesReturnRoute() {
  const searchParams = new URLSearchParams(window.location.search);
  const sourceType = parseSourceType(searchParams.get('sourceType'));
  const sourceId = searchParams.get('sourceId') ?? undefined;

  return <SalesReturnEditor sourceType={sourceType} sourceId={sourceId} />;
}
