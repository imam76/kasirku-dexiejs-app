import { createLazyFileRoute } from '@tanstack/react-router';
import LedgerReportManagement from '@/view/report/LedgerReportManagement';

export const Route = createLazyFileRoute('/report/buku-besar')({
  component: LedgerReportManagement,
});
