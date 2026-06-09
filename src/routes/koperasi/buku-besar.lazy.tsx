import { createLazyFileRoute } from '@tanstack/react-router';
import CooperativeLedgerReportManagement from '@/view/koperasi/reports/CooperativeLedgerReportManagement';

export const Route = createLazyFileRoute('/koperasi/buku-besar')({
  component: CooperativeLedgerReportManagement,
});
