import { createLazyFileRoute } from '@tanstack/react-router';
import BalanceSheetReport from '@/view/BalanceSheetReport';

export const Route = createLazyFileRoute('/report/balance-sheet-report')({
  component: BalanceSheetReport,
});
