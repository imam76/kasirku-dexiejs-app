import { createLazyFileRoute } from '@tanstack/react-router';
import { UserManagement } from '@/view/auth/UserManagement';

export const Route = createLazyFileRoute('/master-data/users')({
  component: UserManagement,
});
