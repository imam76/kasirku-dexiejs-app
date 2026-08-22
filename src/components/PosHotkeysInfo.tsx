import { useEffect, useState } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';
import { ChevronDown, ChevronUp, Keyboard } from 'lucide-react';
import { useI18n } from '@/hooks/useI18n';
import { hasVisiblePosShortcutBlocker } from '@/utils/posShortcutGuards';

const POS_HOTKEYS_INFO_STORAGE_KEY = 'frayukti-show-full-pos-hotkeys';

interface HotkeyEntry {
  keys: string[];
  label: string;
}

interface HotkeyGroup {
  title: string;
  items: HotkeyEntry[];
  hint?: string;
}

const KBD_CLASS = 'min-w-6 rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-center font-mono text-[11px] font-semibold leading-none text-blue-800';

export default function PosHotkeysInfo() {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(() => (
    localStorage.getItem(POS_HOTKEYS_INFO_STORAGE_KEY) === 'true'
  ));

  useEffect(() => {
    localStorage.setItem(POS_HOTKEYS_INFO_STORAGE_KEY, String(expanded));
  }, [expanded]);

  useHotkeys('f1', () => setExpanded((previous) => !previous), {
    enableOnFormTags: true,
    preventDefault: true,
    ignoreEventWhen: () => hasVisiblePosShortcutBlocker(),
  }, []);

  const primaryShortcuts: HotkeyEntry[] = [
    { keys: ['/'], label: t('transaction.shortcut.focusSearch') },
    { keys: ['Enter'], label: t('transaction.shortcut.addProduct') },
    { keys: ['*'], label: t('transaction.shortcut.editQuantity') },
    { keys: ['+', '-'], label: t('transaction.shortcut.changeUnit') },
    { keys: ['Esc'], label: t('transaction.shortcut.clearSearch') },
  ];

  const groups: HotkeyGroup[] = [
    {
      title: t('transaction.hotkeys.group.product'),
      items: [
        { keys: ['/'], label: t('transaction.shortcut.focusSearch') },
        { keys: ['Enter'], label: t('transaction.shortcut.addProduct') },
        { keys: ['Esc'], label: t('transaction.shortcut.clearSearch') },
        { keys: ['F7'], label: t('transaction.shortcut.scanCamera') },
      ],
    },
    {
      title: t('transaction.hotkeys.group.qtyUnit'),
      items: [
        { keys: ['*'], label: t('transaction.shortcut.editQuantity') },
        { keys: ['+', '-'], label: t('transaction.shortcut.changeUnit') },
        { keys: ['PageUp', 'PageDown'], label: t('transaction.shortcut.navigateCartItem') },
        { keys: ['Delete'], label: t('transaction.shortcut.removeActiveItem') },
      ],
      hint: t('transaction.shortcut.quantityZeroHint'),
    },
    {
      title: t('transaction.hotkeys.group.payment'),
      items: [
        { keys: ['F2'], label: t('transaction.shortcut.openPayment') },
        { keys: ['Ctrl', 'Enter'], label: t('transaction.shortcut.confirmPayment') },
        { keys: ['F9'], label: t('transaction.shortcut.addSplitPayment') },
      ],
    },
    {
      title: t('transaction.hotkeys.group.session'),
      items: [
        { keys: ['F6'], label: t('transaction.shortcut.holdDraft') },
        { keys: ['Shift', 'F6'], label: t('transaction.shortcut.openDrafts') },
        { keys: ['F4'], label: t('transaction.shortcut.clearCart') },
        { keys: ['F1'], label: t('transaction.shortcut.toggleHelp') },
      ],
    },
  ];

  return (
    <div className="mt-3 hidden flex-col gap-2 rounded-lg border border-blue-100 bg-blue-50/70 px-3 py-2 text-xs text-blue-900 lg:flex">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5 font-semibold">
          <Keyboard size={15} />
          <span>{t('transaction.desktopShortcutTitle')}</span>
        </div>
        {primaryShortcuts.map((shortcut) => (
          <div
            key={shortcut.label}
            className="flex items-center gap-1.5 rounded-md bg-white px-2 py-1 shadow-sm ring-1 ring-blue-100"
          >
            <span className="flex items-center gap-1">
              {shortcut.keys.map((key) => (
                <kbd key={key} className={KBD_CLASS}>{key}</kbd>
              ))}
            </span>
            <span className="font-medium">{shortcut.label}</span>
          </div>
        ))}
        <button
          type="button"
          data-testid="pos-hotkeys-toggle"
          onClick={() => setExpanded((previous) => !previous)}
          className="ml-auto flex shrink-0 items-center gap-1 rounded-md px-2 py-1 font-semibold text-blue-700 transition-colors hover:bg-blue-100"
        >
          {expanded ? t('transaction.hotkeys.showLess') : t('transaction.hotkeys.showMore')}
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>

      {expanded && (
        <div data-testid="pos-hotkeys-expanded" className="grid grid-cols-2 gap-3 border-t border-blue-100 pt-2 xl:grid-cols-4">
          {groups.map((group) => (
            <div key={group.title} className="rounded-lg bg-white/70 p-2 ring-1 ring-blue-100">
              <p className="mb-1.5 text-[11px] font-black uppercase tracking-wide text-blue-700">{group.title}</p>
              <ul className="grid grid-cols-[auto_1fr] items-start gap-x-2 gap-y-1.5">
                {group.items.map((item) => (
                  <li key={item.label} className="contents">
                    <span className="flex flex-wrap items-center gap-1">
                      {item.keys.map((key) => (
                        <kbd key={key} className={`${KBD_CLASS} bg-blue-50/80`}>{key}</kbd>
                      ))}
                    </span>
                    <span className="font-medium leading-snug">{item.label}</span>
                  </li>
                ))}
              </ul>
              {group.hint && (
                <p className="mt-1.5 border-t border-blue-50 pt-1.5 text-[10px] font-medium leading-snug text-blue-500">
                  {group.hint}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
