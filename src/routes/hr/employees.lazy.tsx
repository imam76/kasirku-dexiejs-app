import { createLazyFileRoute } from '@tanstack/react-router';
import HrEmployeeManagement from '@/view/hr/HrEmployeeManagement';

export const Route = createLazyFileRoute('/hr/employees')({
  component: HrEmployeeManagement,
});
