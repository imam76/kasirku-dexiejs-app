import { createLazyFileRoute } from '@tanstack/react-router';
import MembershipManagement from '@/view/master-data/memberships/MembershipManagement';

export const Route = createLazyFileRoute('/master-data/memberships')({
  component: MembershipManagement,
});
