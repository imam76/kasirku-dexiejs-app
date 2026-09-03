import type { MenuProps } from 'antd';
import type { ReactNode } from 'react';

export type RecordActionGroup = 'primary' | 'secondary' | 'danger';

export interface RecordAction {
  id: string;
  label: string;
  icon?: ReactNode;
  group: RecordActionGroup;
  disabled?: boolean;
  run: () => void | Promise<void>;
}

export interface RecordContextMenuPosition {
  x: number;
  y: number;
}

const groupOrder: Record<RecordActionGroup, number> = {
  primary: 0,
  secondary: 1,
  danger: 2,
};

export const toRecordActionMenuItems = (actions: RecordAction[]): MenuProps['items'] => {
  let previousGroup: RecordActionGroup | undefined;

  return [...actions]
    .sort((left, right) => groupOrder[left.group] - groupOrder[right.group])
    .flatMap((action) => {
      const divider = previousGroup && previousGroup !== action.group
        ? [{ type: 'divider' as const }]
        : [];
      previousGroup = action.group;

      return [
        ...divider,
        {
          key: action.id,
          label: action.label,
          icon: action.icon,
          danger: action.group === 'danger',
          disabled: action.disabled,
        },
      ];
    });
};
