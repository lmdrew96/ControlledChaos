"use client";

import { useCallback, useRef } from "react";

interface UseLongPressOptions {
  onShortPress: () => void;
  onLongPress: () => void;
  thresholdMs?: number;
  /** Pixels of movement that cancel the press (treated as a scroll/drag). */
  moveToleranceInPx?: number;
}

interface LongPressHandlers {
  onMouseDown: (e: React.MouseEvent) => void;
  onMouseUp: (e: React.MouseEvent) => void;
  onMouseMove: (e: React.MouseEvent) => void;
  onMouseLeave: (e: React.MouseEvent) => void;
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchEnd: (e: React.TouchEvent) => void;
  onTouchMove: (e: React.TouchEvent) => void;
  onTouchCancel: (e: React.TouchEvent) => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

/**
 * Tap vs long-press vs swipe discriminator.
 *
 * - Short press: touchend within threshold and no significant movement.
 * - Long press: press held past threshold (fires mid-hold).
 * - Swipe / drag: movement past moveToleranceInPx cancels the press —
 *   the touch is treated as a scroll and no press handler fires. This is
 *   critical for buttons inside horizontally-scrollable containers: the
 *   user expects to pan the list without triggering chip taps.
 */
export function useLongPress({
  onShortPress,
  onLongPress,
  thresholdMs = 500,
  moveToleranceInPx = 10,
}: UseLongPressOptions): LongPressHandlers {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firedLongRef = useRef(false);
  const cancelledRef = useRef(false);
  const startPosRef = useRef<{ x: number; y: number } | null>(null);

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const start = useCallback(
    (x: number, y: number) => {
      firedLongRef.current = false;
      cancelledRef.current = false;
      startPosRef.current = { x, y };
      clearTimer();
      timerRef.current = setTimeout(() => {
        if (cancelledRef.current) return;
        firedLongRef.current = true;
        onLongPress();
      }, thresholdMs);
    },
    [onLongPress, thresholdMs]
  );

  const move = useCallback(
    (x: number, y: number) => {
      if (cancelledRef.current || !startPosRef.current) return;
      const dx = x - startPosRef.current.x;
      const dy = y - startPosRef.current.y;
      if (Math.hypot(dx, dy) > moveToleranceInPx) {
        cancelledRef.current = true;
        clearTimer();
      }
    },
    [moveToleranceInPx]
  );

  const end = useCallback(() => {
    clearTimer();
    if (cancelledRef.current || firedLongRef.current) return;
    onShortPress();
  }, [onShortPress]);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    clearTimer();
  }, []);

  return {
    onMouseDown: (e) => start(e.clientX, e.clientY),
    onMouseMove: (e) => move(e.clientX, e.clientY),
    onMouseUp: () => end(),
    onMouseLeave: () => cancel(),
    onTouchStart: (e) => {
      const t = e.touches[0];
      if (t) start(t.clientX, t.clientY);
    },
    onTouchMove: (e) => {
      const t = e.touches[0];
      if (t) move(t.clientX, t.clientY);
    },
    onTouchEnd: (e) => {
      // Prevent the browser from synthesizing a mouse event after the touch,
      // which would otherwise fire onMouseUp and call end() a second time.
      e.preventDefault();
      end();
    },
    onTouchCancel: () => cancel(),
    onContextMenu: (e) => e.preventDefault(),
  };
}
