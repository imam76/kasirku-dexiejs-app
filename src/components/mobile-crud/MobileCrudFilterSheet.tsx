import { Button } from 'antd';
import type { ReactNode } from 'react';
import MobileCrudBottomSheet from './MobileCrudBottomSheet';

export type MobileCrudFilterSheetProps = {
  open: boolean;
  title: ReactNode;
  children: ReactNode;
  onClose: () => void;
  onReset: () => void;
  resetLabel: ReactNode;
  applyLabel: ReactNode;
  resetDisabled?: boolean;
  onApply?: () => void;
  testId?: string;
};

/** Domain memasok kontrol/filter state; sheet hanya mengatur pola interaksi mobile. */
export default function MobileCrudFilterSheet({
  open,
  title,
  children,
  onClose,
  onReset,
  resetLabel,
  applyLabel,
  resetDisabled = false,
  onApply = onClose,
  testId,
}: MobileCrudFilterSheetProps) {
  return (
    <MobileCrudBottomSheet open={open} title={title} onClose={onClose} testId={testId}>
      <div className="space-y-3 pb-1">
        {children}
        <div className="grid grid-cols-2 gap-2">
          <Button
            size="large"
            disabled={resetDisabled}
            onClick={onReset}
            className="h-12"
          >
            {resetLabel}
          </Button>
          <Button size="large" type="primary" onClick={onApply} className="h-12">
            {applyLabel}
          </Button>
        </div>
      </div>
    </MobileCrudBottomSheet>
  );
}
