import { Outlet, createLazyFileRoute, useLocation } from '@tanstack/react-router';
import OpeningBalancesManagement from '@/view/finance/opening-balances/OpeningBalancesManagement';

function OpeningBalancesRoute() {
  const location = useLocation();
  return location.pathname === '/finance/opening-balances'
    ? <OpeningBalancesManagement />
    : <Outlet />;
}

export const Route = createLazyFileRoute('/finance/opening-balances')({
  component: OpeningBalancesRoute,
});
