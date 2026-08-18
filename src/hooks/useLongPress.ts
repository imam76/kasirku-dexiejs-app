import { useCallback, useEffect, useRef } from 'react';
import type { PointerEvent as ReactPointerEvent, MouseEvent as ReactMouseEvent } from 'react';

const LONG_PRESS_MS = 450;
const MOVE_TOLERANCE_PX = 10;

/**
 * Tekan-lama untuk satu daftar: cukup satu timer karena hanya ada satu jari
 * yang menekan. Gerakan sedikit saja membatalkan supaya tidak bentrok scroll,
 * dan klik yang menyusul setelah tekan-lama ditelan lewat `consume`.
 */
export const useLongPress = <T,>(onLongPress?: (item: T) => void) => {
  const timerRef = useRef<number | undefined>(undefined);
  const originRef = useRef<{ x: number; y: number } | null>(null);
  const firedRef = useRef(false);

  const cancel = useCallback(() => {
    window.clearTimeout(timerRef.current);
    originRef.current = null;
  }, []);

  useEffect(() => cancel, [cancel]);

  const getHandlers = useCallback((item: T) => ({
    onPointerDown: (event: ReactPointerEvent) => {
      if (!onLongPress || event.pointerType === 'mouse') return;
      firedRef.current = false;
      originRef.current = { x: event.clientX, y: event.clientY };
      timerRef.current = window.setTimeout(() => {
        firedRef.current = true;
        navigator.vibrate?.(10);
        onLongPress(item);
      }, LONG_PRESS_MS);
    },
    onPointerMove: (event: ReactPointerEvent) => {
      const origin = originRef.current;
      if (!origin) return;
      const movedTooFar = Math.abs(event.clientX - origin.x) > MOVE_TOLERANCE_PX
        || Math.abs(event.clientY - origin.y) > MOVE_TOLERANCE_PX;
      if (movedTooFar) cancel();
    },
    onPointerUp: cancel,
    onPointerCancel: cancel,
    onContextMenu: (event: ReactMouseEvent) => event.preventDefault(),
  }), [cancel, onLongPress]);

  const consume = useCallback(() => {
    if (!firedRef.current) return false;
    firedRef.current = false;
    return true;
  }, []);

  return { getHandlers, consume };
};
