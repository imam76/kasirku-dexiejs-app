import { createLazyFileRoute } from '@tanstack/react-router';
import HrSalaryComponentManagement from '@/view/hr/HrSalaryComponentManagement';

export const Route = createLazyFileRoute('/hr/salary-components')({
  component: HrSalaryComponentManagement,
});
