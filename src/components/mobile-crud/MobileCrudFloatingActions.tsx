import { FloatButton } from 'antd';
import type { FloatButtonProps } from 'antd';
import type { CSSProperties, ReactNode } from 'react';

export type MobileCrudFloatingAction = {
  key: string;
  label: string;
  icon: ReactNode;
  onClick: () => void;
  type?: FloatButtonProps['type'];
  badge?: FloatButtonProps['badge'];
  disabled?: boolean;
  testId?: string;
  tourId?: string;
};

export type MobileCrudFloatingActionsProps = {
  actions: readonly MobileCrudFloatingAction[];
  bottomOffset?: string;
  insetInlineEnd?: number;
};

/**
 * FAB pertama berada paling bawah; FAB berikutnya otomatis ditumpuk ke atas.
 * Menu lain bebas memakai satu atau beberapa aksi tanpa menghitung posisi sendiri.
 */
export default function MobileCrudFloatingActions({
  actions,
  bottomOffset = 'calc(4rem + var(--app-safe-area-inset-bottom, 0px) + 1rem)',
  insetInlineEnd = 16,
}: MobileCrudFloatingActionsProps) {
  return (
    <>
      {actions.map((action, index) => (
        <FloatButton
          key={action.key}
          type={action.type ?? 'default'}
          icon={action.icon}
          aria-label={action.label}
          aria-disabled={action.disabled || undefined}
          tooltip={action.label}
          badge={action.badge}
          data-testid={action.testId}
          data-tour={action.tourId}
          onClick={action.disabled ? undefined : action.onClick}
          style={{
            '--ant-float-btn-size': '56px',
            bottom: index === 0
              ? bottomOffset
              : `calc(${bottomOffset} + ${index * 4.25}rem)`,
            insetInlineEnd,
            pointerEvents: action.disabled ? 'none' : undefined,
            opacity: action.disabled ? 0.45 : undefined,
          } as CSSProperties & { '--ant-float-btn-size': string }}
        />
      ))}
    </>
  );
}
