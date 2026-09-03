import { Button, Dropdown, Menu } from 'antd';
import { MoreHorizontal } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import {
  toRecordActionMenuItems,
  type RecordAction,
  type RecordContextMenuPosition,
} from '@/utils/recordActions';

const runAction = (actions: RecordAction[], id: string) => {
  const action = actions.find((item) => item.id === id);
  if (!action || action.disabled) return;
  void action.run();
};

interface RecordActionMenuProps {
  actions: RecordAction[];
  ariaLabel: string;
  testId?: string;
}

/** Reusable tombol More untuk action per-record di seluruh modul utama. */
export function RecordActionMenu({ actions, ariaLabel, testId }: RecordActionMenuProps) {
  const items = useMemo(() => toRecordActionMenuItems(actions), [actions]);

  return (
    <Dropdown
      menu={{ items, onClick: ({ key }) => runAction(actions, String(key)) }}
      trigger={['click']}
      placement="bottomRight"
    >
      <Button
        type="text"
        size="small"
        icon={<MoreHorizontal size={18} />}
        aria-label={ariaLabel}
        data-testid={testId}
      />
    </Dropdown>
  );
}

interface RecordContextMenuProps {
  position: RecordContextMenuPosition | null;
  actions: RecordAction[];
  onClose: () => void;
}

/**
 * Context menu berbasis action yang sama dengan tombol More. Posisi dibatasi
 * ke viewport supaya menu tetap dapat dipakai saat klik kanan di tepi layar.
 */
export function RecordContextMenu({ position, actions, onClose }: RecordContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const items = useMemo(() => toRecordActionMenuItems(actions), [actions]);

  useEffect(() => {
    if (!position) return undefined;

    const closeWhenOutside = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) onClose();
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    window.addEventListener('mousedown', closeWhenOutside, true);
    window.addEventListener('keydown', closeOnEscape);

    return () => {
      window.removeEventListener('mousedown', closeWhenOutside, true);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [onClose, position]);

  if (!position || !actions.length) return null;

  const left = Math.max(8, Math.min(position.x, window.innerWidth - 232));
  const top = Math.max(8, Math.min(position.y, window.innerHeight - 240));

  return (
    <div
      ref={menuRef}
      className="fixed z-[1100] min-w-[224px] overflow-hidden rounded-lg border border-gray-200 bg-white py-1 shadow-xl"
      style={{ left, top }}
      onContextMenu={(event) => event.preventDefault()}
    >
      <Menu
        selectable={false}
        items={items}
        onClick={({ key }) => {
          onClose();
          runAction(actions, String(key));
        }}
      />
    </div>
  );
}
