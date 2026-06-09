import { createLazyFileRoute } from '@tanstack/react-router';
import SyncDatabaseManagement from '@/view/SyncDatabaseManagement';

export const Route = createLazyFileRoute('/sync-db')({
  component: SyncDatabaseManagement,
});
