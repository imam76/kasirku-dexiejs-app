import { createLazyFileRoute } from '@tanstack/react-router';
import MarketplaceOrderDetail from '@/view/marketplace/MarketplaceOrderDetail';

export const Route = createLazyFileRoute('/marketplace/shopee/orders/$orderId')({
  component: MarketplaceOrderDetail,
});
