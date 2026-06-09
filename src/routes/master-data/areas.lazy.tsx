import { createLazyFileRoute } from '@tanstack/react-router';
import AreaManagement from '@/view/master-data/areas/AreaManagement';

export const Route = createLazyFileRoute('/master-data/areas')({
  component: AreaManagement,
});
