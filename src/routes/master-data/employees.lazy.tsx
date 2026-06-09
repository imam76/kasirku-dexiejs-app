import { createLazyFileRoute } from '@tanstack/react-router';
import EmployeeManagement from '@/view/master-data/employees/EmployeeManagement';

export const Route = createLazyFileRoute('/master-data/employees')({
  component: EmployeeManagement,
});
