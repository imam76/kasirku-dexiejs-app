import { createLazyFileRoute } from '@tanstack/react-router';
import HrLeaveManagement from '@/view/hr/HrLeaveManagement';

export const Route = createLazyFileRoute('/hr/leave')({
  component: HrLeaveManagement,
});
