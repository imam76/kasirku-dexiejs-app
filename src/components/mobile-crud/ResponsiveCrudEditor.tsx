import { Button, Drawer, Modal } from 'antd';
import type { ReactNode } from 'react';
import { useI18n } from '@/hooks/useI18n';
import { useIsMobile } from '@/hooks/useIsMobile';

export type ResponsiveCrudEditorProps = {
  open: boolean;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  desktopWidth?: number;
  destroyOnClose?: boolean;
  /** Tombol "Tutup" tambahan di footer (mobile), supaya tidak cuma bisa dijangkau lewat ikon X di pojok atas. */
  showCloseButton?: boolean;
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
  showCloseButton = false,
}: ResponsiveCrudEditorProps) {
  const { t } = useI18n();
  const isMobile = useIsMobile();

  if (isMobile) {
    const mobileFooter = showCloseButton ? (
      <div className="space-y-2">
        {footer}
        <Button block size="large" className="h-12" onClick={onClose}>
          {t('common.close')}
        </Button>
      </div>
    ) : footer;

    return (
      <Drawer
        title={title}
        placement="right"
        width="100%"
        open={open}
        onClose={onClose}
        footer={mobileFooter}
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
