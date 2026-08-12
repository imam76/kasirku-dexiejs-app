import { Drawer, Modal } from 'antd';
import type { ReactNode } from 'react';
import { useIsMobile } from '@/hooks/useIsMobile';

export type ResponsiveCrudEditorProps = {
  open: boolean;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  desktopWidth?: number;
  destroyOnClose?: boolean;
};

/**
 * Form CRUD panjang menjadi full-screen drawer pada ponsel dan modal pada
 * viewport yang lebih lebar. Konten form tetap satu instance/implementasi.
 */
export default function ResponsiveCrudEditor({
  open,
  title,
  children,
  footer,
  onClose,
  desktopWidth = 760,
  destroyOnClose = true,
}: ResponsiveCrudEditorProps) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <Drawer
        title={title}
        placement="right"
        width="100%"
        open={open}
        onClose={onClose}
        footer={footer}
        destroyOnHidden={destroyOnClose}
        rootClassName="mobile-crud-editor"
        styles={{
          body: { padding: '16px', overflowY: 'auto' },
          header: { padding: '14px 16px' },
          footer: {
            padding: '12px 16px',
            paddingBottom:
              'calc(max(12px, var(--app-safe-area-inset-bottom)) + var(--app-keyboard-inset-bottom, 0px))',
          },
        }}
      >
        {children}
      </Drawer>
    );
  }

  return (
    <Modal
      title={title}
      open={open}
      onCancel={onClose}
      footer={footer}
      destroyOnHidden={destroyOnClose}
      width={desktopWidth}
      centered
    >
      {children}
    </Modal>
  );
}
