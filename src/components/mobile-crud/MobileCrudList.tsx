import { Button, Empty, Skeleton, theme as antdTheme } from 'antd';
import { MoreVertical } from 'lucide-react';
import {
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  getMobileCrudRemainingCount,
  getNextMobileCrudVisibleCount,
} from '@/utils/mobileCrud';
import MobileCrudBottomSheet from './MobileCrudBottomSheet';

export type MobileCrudAction<T> = {
  key: string;
  label: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  danger?: boolean;
  disabled?: boolean;
  hidden?: boolean;
  onSelect: (item: T) => void | Promise<void>;
};

export type MobileCrudListProps<T> = {
  items: readonly T[];
  getKey: (item: T) => string;
  renderItem: (item: T) => ReactNode;
  getActions?: (item: T) => MobileCrudAction<T>[];
  getActionSheetTitle?: (item: T) => ReactNode;
  getItemAriaLabel?: (item: T) => string;
  getActionsAriaLabel?: (item: T) => string;
  onItemClick?: (item: T) => void;
  loading?: boolean;
  emptyText: ReactNode;
  emptyAction?: ReactNode;
  initialVisibleCount?: number;
  visibleStep?: number;
  resetKey?: string;
  loadMoreLabel: (remaining: number) => ReactNode;
  resultSummary?: ReactNode;
};

/**
 * Primitive daftar CRUD khusus ponsel. Domain hanya memasok isi card dan aksi;
 * progressive disclosure, target sentuh, action sheet, loading, dan empty state
 * ditangani konsisten di satu tempat.
 */
function MobileCrudListStateful<T>({
  items,
  getKey,
  renderItem,
  getActions,
  getActionSheetTitle,
  getItemAriaLabel,
  getActionsAriaLabel,
  onItemClick,
  loading = false,
  emptyText,
  emptyAction,
  initialVisibleCount = 20,
  visibleStep = 20,
  loadMoreLabel,
  resultSummary,
}: MobileCrudListProps<T>) {
  const { token } = antdTheme.useToken();
  const [visibleCount, setVisibleCount] = useState(initialVisibleCount);
  const [actionCandidate, setActionCandidate] = useState<T | null>(null);
  const actionItem = actionCandidate
    ? items.find((item) => getKey(item) === getKey(actionCandidate)) ?? null
    : null;

  const visibleItems = useMemo(
    () => items.slice(0, visibleCount),
    [items, visibleCount],
  );
  const remainingCount = getMobileCrudRemainingCount(items.length, visibleItems.length);
  const activeActions = actionItem
    ? (getActions?.(actionItem) ?? []).filter((action) => !action.hidden)
    : [];

  const closeActionSheet = () => setActionCandidate(null);

  const runAction = async (action: MobileCrudAction<T>) => {
    if (!actionItem || action.disabled) return;
    const item = actionItem;
    closeActionSheet();
    await action.onSelect(item);
  };

  if (loading) {
    return (
      <div className="space-y-3" aria-busy="true" aria-live="polite">
        {Array.from({ length: 4 }, (_, index) => (
          <div
            key={index}
            className="rounded-xl border p-4"
            style={{ background: token.colorBgContainer, borderColor: token.colorBorderSecondary }}
          >
            <Skeleton active paragraph={{ rows: 2 }} title={{ width: '65%' }} />
          </div>
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div
        className="rounded-xl border px-4 py-10"
        style={{ background: token.colorBgContainer, borderColor: token.colorBorderSecondary }}
      >
        <Empty description={emptyText}>{emptyAction}</Empty>
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="mobile-crud-list">
      {resultSummary ? (
        <div className="px-1 text-xs" style={{ color: token.colorTextSecondary }} aria-live="polite">
          {resultSummary}
        </div>
      ) : null}

      <div className="space-y-2.5">
        {visibleItems.map((item) => {
          const itemActions = (getActions?.(item) ?? []).filter((action) => !action.hidden);
          const content = renderItem(item);

          return (
            <article
              key={getKey(item)}
              className="flex min-w-0 items-stretch rounded-xl border shadow-sm transition active:scale-[0.995]"
              style={{ background: token.colorBgContainer, borderColor: token.colorBorderSecondary }}
              data-testid="mobile-crud-item"
            >
              {onItemClick ? (
                <button
                  type="button"
                  className="min-w-0 flex-1 rounded-l-xl p-4 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset"
                  aria-label={getItemAriaLabel?.(item)}
                  onClick={() => onItemClick(item)}
                >
                  {content}
                </button>
              ) : (
                <div className="min-w-0 flex-1 p-4">{content}</div>
              )}

              {itemActions.length > 0 ? (
                <div className="flex items-start p-2 pl-0">
                  <button
                    type="button"
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl outline-none transition-colors hover:bg-gray-100 focus-visible:ring-2 focus-visible:ring-inset dark:hover:bg-gray-800"
                    aria-label={getActionsAriaLabel?.(item)}
                    aria-haspopup="dialog"
                    onClick={() => setActionCandidate(item)}
                  >
                    <MoreVertical aria-hidden size={20} />
                  </button>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>

      {remainingCount > 0 ? (
        <Button
          block
          size="large"
          className="h-12"
          onClick={() => setVisibleCount((current) => (
            getNextMobileCrudVisibleCount(items.length, current, visibleStep)
          ))}
        >
          {loadMoreLabel(remainingCount)}
        </Button>
      ) : null}

      <MobileCrudBottomSheet
        title={actionItem ? getActionSheetTitle?.(actionItem) : undefined}
        open={actionItem !== null}
        onClose={closeActionSheet}
        rootClassName="mobile-crud-action-sheet"
        bodyStyle={{ padding: '8px 16px 16px' }}
      >
        <div className="space-y-1 pb-2">
          {activeActions.map((action) => (
            <button
              key={action.key}
              type="button"
              disabled={action.disabled}
              className={[
                'flex min-h-14 w-full items-center gap-3 rounded-xl px-3 py-2 text-left outline-none transition-colors',
                action.danger
                  ? 'text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30'
                  : 'hover:bg-gray-100 dark:hover:bg-gray-800',
                action.disabled ? 'cursor-not-allowed opacity-45' : '',
              ].join(' ')}
              onClick={() => void runAction(action)}
            >
              {action.icon ? (
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-current/10">
                  {action.icon}
                </span>
              ) : null}
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{action.label}</span>
                {action.description ? (
                  <span className="mt-0.5 block text-xs font-normal opacity-70">{action.description}</span>
                ) : null}
              </span>
            </button>
          ))}
        </div>
      </MobileCrudBottomSheet>
    </div>
  );
}

/** `key` mereset seluruh state sementara tanpa effect ketika query berubah. */
export default function MobileCrudList<T>(props: MobileCrudListProps<T>) {
  const stateKey = `${props.resetKey ?? ''}\u0000${props.initialVisibleCount ?? 20}`;
  return <MobileCrudListStateful key={stateKey} {...props} />;
}
