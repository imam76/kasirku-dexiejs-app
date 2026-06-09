import { createLazyFileRoute } from '@tanstack/react-router';
import RoleManagement from '@/view/master-data/roles/RoleManagement';

export const Route = createLazyFileRoute('/master-data/roles')({
  component: RoleManagement,
});
