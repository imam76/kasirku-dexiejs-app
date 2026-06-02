import { RouterProvider, createRouter } from '@tanstack/react-router';
import { useSyncQueueWorker } from '@/hooks/useSyncQueueWorker';
import { routeTree } from '@/routeTree.gen';

const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

export default function AppShell() {
  useSyncQueueWorker();

  return <RouterProvider router={router} scrollRestoration={true} />;
}
