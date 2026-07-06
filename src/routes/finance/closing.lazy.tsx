import { createLazyFileRoute } from '@tanstack/react-router';
import ClosingManagement from '@/view/finance/closing/ClosingManagement';

export const Route = createLazyFileRoute('/finance/closing')({
  component: ClosingManagement,
});
