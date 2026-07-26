import { createLazyFileRoute } from '@tanstack/react-router';
import { HrDepartmentManagement } from '@/view/hr/HrOrganizationManagement';

export const Route = createLazyFileRoute('/hr/departments')({
  component: HrDepartmentManagement,
});
