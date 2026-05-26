import { createLazyFileRoute } from '@tanstack/react-router';
import GeneralLedgerManagement from '@/view/finance/general-ledger/GeneralLedgerManagement';

export const Route = createLazyFileRoute('/finance/general-ledger')({
  component: GeneralLedgerManagement,
});
