"use client";

import { useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

interface ShortcutCallbacks {
  onNewTask?: () => void;
  onToggleShortcuts?: () => void;
}

/**
 * Global keyboard shortcuts for ControlledChaos.
 *
 * Cmd/Ctrl + D → Brain Dump
 * Cmd/Ctrl + N → New Task (calls onNewTask callback)
 * Cmd/Ctrl + / → Toggle shortcut cheat sheet
 *
 * All shortcuts are suppressed when focus is inside an input, textarea,
 * or contenteditable element to avoid conflicts with typing.
 */
export function useKeyboardShortcuts({ onNewTask, onToggleShortcuts }: ShortcutCallbacks = {}) {
  const router = useRouter();

  const handler = useCallback(
    (e: KeyboardEvent) => {
      // Don't fire in text inputs
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }

      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;

      switch (e.key.toLowerCase()) {
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
    [router, onNewTask, onToggleShortcuts]
  );

  useEffect(() => {
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [handler]);
}

/** Shortcut definitions for the cheat sheet UI */
export const SHORTCUTS = [
  { keys: ["⌘", "D"], description: "Brain Dump" },
  { keys: ["⌘", "N"], description: "New Task" },
  { keys: ["⌘", "/"], description: "Keyboard shortcuts" },
] as const;
