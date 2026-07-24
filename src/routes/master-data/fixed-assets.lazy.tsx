import { createLazyFileRoute } from '@tanstack/react-router';
import FixedAssetManagement from '@/view/master-data/fixed-assets/FixedAssetManagement';

export const Route = createLazyFileRoute('/master-data/fixed-assets')({
  component: FixedAssetManagement,
});
