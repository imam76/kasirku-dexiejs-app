import { createLazyFileRoute } from '@tanstack/react-router';
import CollectionCoverageManagement from '@/view/koperasi/CollectionCoverageManagement';

export const Route = createLazyFileRoute('/koperasi/coverage-conflicts')({
  component: CollectionCoverageManagement,
});
