"use client";

import { useState, useEffect, useSyncExternalStore } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const STANDALONE_QUERY = "(display-mode: standalone)";

const subscribeStandalone = (onChange: () => void) => {
  const mql = window.matchMedia(STANDALONE_QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
};

export function useInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [installedThisSession, setInstalledThisSession] = useState(false);

  // Running in standalone mode means it's already installed. This is a live
  // media query rather than a one-shot read, so launching the installed copy
  // mid-session updates it too.
  const isStandalone = useSyncExternalStore(
    subscribeStandalone,
    () => window.matchMedia(STANDALONE_QUERY).matches,
    () => false
  );
  const isInstalled = isStandalone || installedThisSession;

  useEffect(() => {
    function handleBeforeInstall(e: Event) {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    }

    function handleAppInstalled() {
      setInstalledThisSession(true);
      setDeferredPrompt(null);
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstall);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  async function promptInstall(): Promise<boolean> {
    if (!deferredPrompt) return false;

    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    return outcome === "accepted";
  }

  // Detect iOS Safari (no beforeinstallprompt support)
  const isIOS =
    typeof navigator !== "undefined" &&
    /iphone|ipad|ipod/i.test(navigator.userAgent) &&
    !isInstalled;

  return {
    canInstall: !!deferredPrompt && !isInstalled,
    isInstalled,
    isIOS,
    promptInstall,
  };
}
