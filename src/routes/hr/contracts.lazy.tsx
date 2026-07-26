import { createLazyFileRoute } from '@tanstack/react-router';
import HrContractManagement from '@/view/hr/HrContractManagement';

export const Route = createLazyFileRoute('/hr/contracts')({
  component: HrContractManagement,
});
