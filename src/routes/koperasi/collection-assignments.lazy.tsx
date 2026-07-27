import { createLazyFileRoute } from '@tanstack/react-router';
import CollectionAssignmentManagement from '@/view/koperasi/CollectionAssignmentManagement';

export const Route = createLazyFileRoute('/koperasi/collection-assignments')({
  component: CollectionAssignmentManagement,
});
