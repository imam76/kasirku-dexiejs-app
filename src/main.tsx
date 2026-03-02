import { RouterProvider, createRouter } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { routeTree } from '@/routeTree.gen';
// import App from './App.tsx';
import '@/index.css';
import { ThemeProvider } from '@/ThemeProvider';
import { QueryProvider } from '@/providers/QueryProvider';
import '@/lib/dayjs';

// Create a new router instance
const router = createRouter({ routeTree })

// Register the router instance for type safety
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryProvider>
      <ThemeProvider defaultMode="light">
        <RouterProvider router={router} />
      </ThemeProvider>
    </QueryProvider>
  </StrictMode>
);
