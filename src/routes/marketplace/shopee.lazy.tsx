import { createLazyFileRoute } from '@tanstack/react-router';
import MarketplaceShopeeManagement from '@/view/marketplace/MarketplaceShopeeManagement';

export const Route = createLazyFileRoute('/marketplace/shopee')({
  component: MarketplaceShopeeManagement,
});
