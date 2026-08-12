import { Link } from '@tanstack/react-router';
import { theme as antdTheme } from 'antd';
import { MoreHorizontal, type LucideIcon } from 'lucide-react';
import { isMobileBottomNavigationItemActive } from '@/utils/mobileBottomNavigation';

export type MobileBottomNavigationItem = {
  to: string;
  label: string;
  icon: LucideIcon;
  activePaths?: string[];
};

type MobileBottomNavigationProps = {
  pathname: string;
  items: MobileBottomNavigationItem[];
  moreLabel: string;
  navigationLabel: string;
  drawerOpen: boolean;
  onOpenMore: () => void;
};

export function MobileBottomNavigation({
  pathname,
  items,
  moreLabel,
  navigationLabel,
  drawerOpen,
  onOpenMore,
}: MobileBottomNavigationProps) {
  const { token } = antdTheme.useToken();
  const hasActivePrimaryItem = items.some((item) => (
    isMobileBottomNavigationItemActive(pathname, item)
  ));
  const isMoreActive = drawerOpen || !hasActivePrimaryItem;

  const getItemColor = (active: boolean) => (
    active ? token.colorPrimary : token.colorTextTertiary
  );

  return (
    <nav
      aria-label={navigationLabel}
      data-testid="mobile-bottom-navigation"
      className="safe-area-pad-right safe-area-pad-bottom safe-area-pad-left fixed inset-x-0 bottom-0 z-40 border-t md:hidden"
      style={{
        background: token.colorBgElevated,
        borderColor: token.colorBorderSecondary,
        boxShadow: token.boxShadowSecondary,
      }}
    >
      <div className="mx-auto flex h-16 w-full max-w-lg items-stretch px-1">
        {items.map((item) => {
          const Icon = item.icon;
          const active = isMobileBottomNavigationItemActive(pathname, item);

          return (
            <Link
              key={item.to}
              to={item.to}
              aria-current={active ? 'page' : undefined}
              className="group relative flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-1 py-1.5 font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset"
              style={{ color: getItemColor(active) }}
            >
              {active && (
                <span
                  aria-hidden
                  className="absolute top-0 h-0.5 w-8 rounded-full"
                  style={{ background: token.colorPrimary }}
                />
              )}
              <Icon aria-hidden size={21} strokeWidth={active ? 2.4 : 2} />
              <span className="w-full truncate text-center text-[10px] leading-tight min-[360px]:text-[11px]">
                {item.label}
              </span>
            </Link>
          );
        })}

        <button
          type="button"
          onClick={onOpenMore}
          aria-expanded={drawerOpen}
          className="relative flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-1 py-1.5 font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset"
          style={{ color: getItemColor(isMoreActive) }}
        >
          {isMoreActive && (
            <span
              aria-hidden
              className="absolute top-0 h-0.5 w-8 rounded-full"
              style={{ background: token.colorPrimary }}
            />
          )}
          <MoreHorizontal aria-hidden size={22} strokeWidth={isMoreActive ? 2.4 : 2} />
          <span className="w-full truncate text-center text-[10px] leading-tight min-[360px]:text-[11px]">
            {moreLabel}
          </span>
        </button>
      </div>
    </nav>
  );
}
