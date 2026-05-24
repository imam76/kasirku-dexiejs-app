import { createLazyFileRoute } from '@tanstack/react-router';
import TaxManagement from '@/view/master-data/taxes/TaxManagement';

export const Route = createLazyFileRoute('/master-data/taxes')({
  component: TaxManagement,
});
