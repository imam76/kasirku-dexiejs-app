import type { ReactNode } from 'react';
import { Card } from 'antd';

interface ManagementListCardProps {
  title: ReactNode;
  icon: ReactNode;
  actions?: ReactNode;
  toolbar?: ReactNode;
  children: ReactNode;
}

export default function ManagementListCard({
  title,
  icon,
  actions,
  toolbar,
  children,
}: ManagementListCardProps) {
  return (
    <Card
      className="rounded-md shadow-md"
      title={(
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex shrink-0 items-center">{icon}</span>
          <span className="truncate text-base font-semibold sm:text-lg">{title}</span>
        </div>
      )}
      extra={actions}
    >
      {toolbar ? <div className="mb-4">{toolbar}</div> : null}
      {children}
    </Card>
  );
}
