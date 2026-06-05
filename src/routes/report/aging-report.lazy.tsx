import { createLazyFileRoute } from '@tanstack/react-router';
import AgingReport from '@/view/AgingReport';

export const Route = createLazyFileRoute('/report/aging-report')({
  component: AgingReport,
});
