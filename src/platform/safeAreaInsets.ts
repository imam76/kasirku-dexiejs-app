const isTauriRuntime = () => (
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
);

export async function initializeSafeAreaInsets() {
  if (!isTauriRuntime()) return;

  const safeArea = await import('@saurl/tauri-plugin-safe-area-insets-css-api');
  let keyboardOpen = false;
  let refreshFrame: number | undefined;

  const setInset = (edge: 'top' | 'bottom', inset: number) => {
    document.documentElement.style.setProperty(`--safe-area-inset-${edge}`, `${inset}px`);
  };

  const refreshInsets = async () => {
    const [topInset, bottomInset] = await Promise.all([
      safeArea.getTopInset(),
      safeArea.getBottomInset(),
    ]);

    if (topInset) setInset('top', topInset.inset);
    if (bottomInset && !keyboardOpen) setInset('bottom', bottomInset.inset);
  };

  const scheduleRefresh = () => {
    if (keyboardOpen || refreshFrame !== undefined) return;
    refreshFrame = window.requestAnimationFrame(() => {
      refreshFrame = undefined;
      void refreshInsets();
    });
  };

  await Promise.all([
    safeArea.onKeyboardShown(() => {
      keyboardOpen = true;
      setInset('bottom', 0);
    }),
    safeArea.onKeyboardHidden(() => {
      keyboardOpen = false;
      void refreshInsets();
    }),
  ]);

  window.addEventListener('resize', scheduleRefresh, { passive: true });
  window.addEventListener('orientationchange', scheduleRefresh, { passive: true });
  await refreshInsets();
}
