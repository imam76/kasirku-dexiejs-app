import { createLazyFileRoute } from '@tanstack/react-router';
import { HrPositionManagement } from '@/view/hr/HrOrganizationManagement';

export const Route = createLazyFileRoute('/hr/positions')({
  component: HrPositionManagement,
});
