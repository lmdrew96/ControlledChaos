import { useCallback, useSyncExternalStore } from "react";

/**
 * Whether the desktop sidebar is folded away, remembered per browser.
 *
 * useSyncExternalStore rather than useState(localStorage…): the server always
 * renders the sidebar open, and this hands React that same value to hydrate
 * with before switching to the stored one, so there's no hydration mismatch.
 * Storage can throw (private windows, blocked site data); then the toggle
 * still works for this page load, it just isn't remembered.
 */
const KEY = "cc-sidebar-collapsed";
const listeners = new Set<() => void>();
let memory: boolean | null = null;

function read(): boolean {
  if (memory !== null) return memory;
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // Another tab changed it: drop the in-memory copy and re-read storage.
  const onStorage = (e: StorageEvent) => {
    if (e.key !== KEY) return;
    memory = null;
    listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function useSidebarCollapsed(): [boolean, (collapsed: boolean) => void] {
  const collapsed = useSyncExternalStore(subscribe, read, () => false);
  const setCollapsed = useCallback((next: boolean) => {
    memory = next;
    try {
      if (next) localStorage.setItem(KEY, "1");
      else localStorage.removeItem(KEY);
    } catch (err) {
      console.warn("[Sidebar] Couldn't remember sidebar state:", err);
    }
    listeners.forEach((l) => l());
  }, []);
  return [collapsed, setCollapsed];
}
