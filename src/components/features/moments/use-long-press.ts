"use client";

import { useCallback, useRef } from "react";

interface UseLongPressOptions {
  onShortPress: () => void;
  onLongPress: () => void;
  thresholdMs?: number;
}

interface LongPressHandlers {
  onMouseDown: (e: React.MouseEvent) => void;
  onMouseUp: (e: React.MouseEvent) => void;
  onMouseLeave: (e: React.MouseEvent) => void;
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchEnd: (e: React.TouchEvent) => void;
  onTouchCancel: (e: React.TouchEvent) => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

/**
 * Long-press vs short-press discriminator. Short press fires on release
 * before the threshold; long press fires at threshold while still pressed
 * (and suppresses the subsequent short press).
 */
export function useLongPress({
  onShortPress,
  onLongPress,
  thresholdMs = 500,
}: UseLongPressOptions): LongPressHandlers {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firedLongRef = useRef(false);

  const start = useCallback(() => {
    firedLongRef.current = false;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      firedLongRef.current = true;
      onLongPress();
    }, thresholdMs);
  }, [onLongPress, thresholdMs]);

  const end = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (!firedLongRef.current) {
      onShortPress();
    }
  }, [onShortPress]);

  const cancel = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  return {
    onMouseDown: () => start(),
    onMouseUp: () => end(),
    onMouseLeave: () => cancel(),
    onTouchStart: () => start(),
    onTouchEnd: (e) => {
      e.preventDefault(); // prevent emulated mouse events on mobile
      end();
    },
    onTouchCancel: () => cancel(),
    onContextMenu: (e) => e.preventDefault(),
  };
}
