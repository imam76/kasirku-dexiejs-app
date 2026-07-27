import { Link, useMatches } from '@tanstack/react-router';
import { Breadcrumb } from 'antd';
import { ChevronRight } from 'lucide-react';
import { useI18n } from '@/hooks/useI18n';
import {
  getBreadcrumbItems,
  shouldShowBreadcrumbs,
} from '@/navigation/breadcrumbs';

type GlobalBreadcrumbProps = {
  pathname: string;
};

export function GlobalBreadcrumb({ pathname }: GlobalBreadcrumbProps) {
  const { t } = useI18n();
  const currentMatch = useMatches({
    select: (matches) => {
      const leafMatch = matches[matches.length - 1];
      return leafMatch
        ? { routeId: leafMatch.routeId as string, status: leafMatch.status }
        : undefined;
    },
    structuralSharing: true,
  });
  const breadcrumbItems = getBreadcrumbItems(pathname, t);
  const isUnavailableMatch =
    !currentMatch ||
    currentMatch.routeId === '/$' ||
    currentMatch.status !== 'success';

  if (isUnavailableMatch || !shouldShowBreadcrumbs(pathname, breadcrumbItems)) {
    return null;
  }

  return (
    <nav
      aria-label={t('breadcrumb.ariaLabel')}
      data-testid="global-breadcrumb"
      className="mb-3 max-w-full overflow-x-auto pb-1 [scrollbar-width:thin]"
    >
      <Breadcrumb
        className="w-max min-w-full whitespace-nowrap [&_ol]:!items-center [&_ol]:!flex-nowrap [&_li]:shrink-0 [&_.ant-breadcrumb-link]:!inline-flex [&_.ant-breadcrumb-link]:!items-center [&_.ant-breadcrumb-separator]:!flex [&_.ant-breadcrumb-separator]:!self-stretch [&_.ant-breadcrumb-separator]:!items-center"
        separator={(
          <ChevronRight
            aria-hidden="true"
            className="text-gray-400 dark:text-gray-500"
            size={14}
          />
        )}
        items={breadcrumbItems.map((item, index) => ({
          key: `${index}-${item.label}`,
          'aria-current': item.current ? 'page' : undefined,
          title: item.current ? (
            <span className="font-medium text-gray-800 dark:text-gray-100">
              {item.label}
            </span>
          ) : item.to ? (
            <Link
              to={item.to}
              preload="intent"
              className="text-gray-500 transition-colors hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-300"
            >
              {item.label}
            </Link>
          ) : (
            <span className="text-gray-500 dark:text-gray-400">
              {item.label}
            </span>
          ),
        }))}
      />
    </nav>
  );
}
