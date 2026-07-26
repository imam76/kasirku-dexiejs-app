import { createLazyFileRoute } from '@tanstack/react-router';
import HrDashboard from '@/view/hr/HrDashboard';

export const Route = createLazyFileRoute('/hr/dashboard')({
  component: HrDashboard,
});
