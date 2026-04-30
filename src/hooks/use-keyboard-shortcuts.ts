"use client";

import { useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

interface ShortcutCallbacks {
  onNewTask?: () => void;
  onToggleShortcuts?: () => void;
  onTogglePalette?: () => void;
}

/**
 * Global keyboard shortcuts for ControlledChaos.
 *
 * Cmd/Ctrl + K → Command palette (jump-to-anything)
 * Cmd/Ctrl + D → Brain Dump
 * Cmd/Ctrl + N → New Task (calls onNewTask callback)
 * Cmd/Ctrl + / → Toggle shortcut cheat sheet
 *
 * Cmd+K fires even inside text inputs (it's the universal "search" gesture);
 * other shortcuts are suppressed when typing.
 */
export function useKeyboardShortcuts({
  onNewTask,
  onToggleShortcuts,
  onTogglePalette,
}: ShortcutCallbacks = {}) {
  const router = useRouter();

  const handler = useCallback(
    (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;

      const key = e.key.toLowerCase();

      // Cmd+K works even inside inputs
      if (key === "k") {
        e.preventDefault();
        onTogglePalette?.();
        return;
      }

      // Other shortcuts: suppress in text inputs
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }

      switch (key) {
        case "d":
          e.preventDefault();
          router.push("/dump");
          break;
        case "n":
          e.preventDefault();
          onNewTask?.();
          break;
        case "/":
          e.preventDefault();
          onToggleShortcuts?.();
          break;
      }
    },
    [router, onNewTask, onToggleShortcuts, onTogglePalette]
  );

  useEffect(() => {
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [handler]);
}

/** Shortcut definitions for the cheat sheet UI */
export const SHORTCUTS = [
  { keys: ["⌘", "K"], description: "Command palette" },
  { keys: ["⌘", "D"], description: "Brain Dump" },
  { keys: ["⌘", "N"], description: "New Task" },
  { keys: ["⌘", "/"], description: "Keyboard shortcuts" },
] as const;
