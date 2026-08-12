import { Drawer } from 'antd';
import type { CSSProperties, ReactNode } from 'react';

export type MobileCrudBottomSheetProps = {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: ReactNode;
  closable?: boolean;
  destroyOnClose?: boolean;
  bodyStyle?: CSSProperties;
  headerStyle?: CSSProperties;
  rootClassName?: string;
  testId?: string;
};

/**
 * Bottom sheet bersama untuk filter, detail, dan menu aksi CRUD mobile.
 * Safe-area, radius, lifecycle, dan ukuran drawer tidak perlu diulang oleh domain.
 */
export default function MobileCrudBottomSheet({
  open,
  onClose,
  children,
  title,
  closable = true,
  destroyOnClose = true,
  bodyStyle,
  headerStyle,
  rootClassName,
  testId,
}: MobileCrudBottomSheetProps) {
  return (
    <Drawer
      title={title}
      placement="bottom"
      open={open}
      onClose={onClose}
      closable={closable}
      size="auto"
      destroyOnHidden={destroyOnClose}
      rootClassName={['mobile-bottom-drawer', rootClassName].filter(Boolean).join(' ')}
      styles={{
        body: {
          padding: 16,
          paddingBottom: 'calc(16px + var(--app-safe-area-inset-bottom, 0px))',
          ...bodyStyle,
        },
        header: { padding: '16px 20px', ...headerStyle },
      }}
    >
      <div data-testid={testId}>{children}</div>
    </Drawer>
  );
}
