export type MobileBottomNavigationPathItem = {
  to: string;
  activePaths?: string[];
};

export const isMobileBottomNavigationItemActive = (
  pathname: string,
  item: MobileBottomNavigationPathItem,
) => [item.to, ...(item.activePaths ?? [])].some((path) => (
  path === '/'
    ? pathname === '/'
    : pathname === path || pathname.startsWith(`${path}/`)
));
