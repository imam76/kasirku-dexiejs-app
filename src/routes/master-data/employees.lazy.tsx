import { Navigate, createLazyFileRoute } from '@tanstack/react-router';

export const Route = createLazyFileRoute('/master-data/employees')({
  component: () => <Navigate to="/hr/employees" replace />,
});
