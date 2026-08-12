import type { ReactNode } from 'react';

export type MobileCrudPageHeaderProps = {
  title: ReactNode;
  icon?: ReactNode;
  breadcrumb?: ReactNode;
  action?: ReactNode;
  testId?: string;
};

/** Fixed header mobile yang mengikuti offset navbar dan safe-area aplikasi. */
export default function MobileCrudPageHeader({
  title,
  icon,
  breadcrumb,
  action,
  testId,
}: MobileCrudPageHeaderProps) {
  return (
    <>
      <header
        data-testid={testId}
        className="mobile-page-fixed-header fixed inset-x-0 z-[39] border-b border-gray-200 bg-white py-3 shadow-sm dark:border-gray-700 dark:bg-gray-800"
      >
        {breadcrumb}
        <div className="flex min-h-11 items-center justify-between gap-3">
          <h1 className="flex min-w-0 items-center gap-2 text-lg font-bold text-gray-900 dark:text-gray-100">
            {icon}
            <span className="truncate">{title}</span>
          </h1>
          {action}
        </div>
      </header>
      <div aria-hidden className="mobile-page-fixed-header-spacer mb-4" />
    </>
  );
}
