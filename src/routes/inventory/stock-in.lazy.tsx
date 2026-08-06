import { createLazyFileRoute } from '@tanstack/react-router';
import StockInPage from '@/view/inventory/StockInPage';

export const Route = createLazyFileRoute('/inventory/stock-in')({
  component: StockInPage,
});
