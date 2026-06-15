import { createLazyFileRoute } from '@tanstack/react-router';
import ProductionManagement from '@/view/production/ProductionManagement';

export const Route = createLazyFileRoute('/master-data/production')({
  component: ProductionManagement,
});
