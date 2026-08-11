const POS_SHORTCUT_BLOCKER_SELECTORS = [
  '.ant-modal-wrap',
  '.ant-drawer-open .ant-drawer-content-wrapper',
  '.ant-select-dropdown',
];

export const isPosShortcutTypingTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) return false;

  const tagName = target.tagName.toLowerCase();
  return target.isContentEditable || tagName === 'input' || tagName === 'textarea' || tagName === 'select';
};

// Dialogs (payment, quick-item, close-cashier, dropdowns) manage their own keyboard
// handling, so POS-wide hotkeys must yield whenever one of these is visible.
export const hasVisiblePosShortcutBlocker = () => POS_SHORTCUT_BLOCKER_SELECTORS.some((selector) => (
  Array.from(document.querySelectorAll<HTMLElement>(selector))
    .some((element) => element.getClientRects().length > 0)
));
