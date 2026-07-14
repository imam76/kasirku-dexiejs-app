import { createLazyFileRoute, Navigate } from '@tanstack/react-router';

export const Route = createLazyFileRoute('/finance/general-ledger/setup')({
  component: () => <Navigate to="/finance/opening-balances/accounts" replace />,
});
