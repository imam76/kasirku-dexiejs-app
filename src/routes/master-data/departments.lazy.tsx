import { createLazyFileRoute } from '@tanstack/react-router';
import DepartmentManagement from '@/view/master-data/departments/DepartmentManagement';

export const Route = createLazyFileRoute('/master-data/departments')({
  component: DepartmentManagement,
});
