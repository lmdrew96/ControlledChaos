"use client";

import { UserButton } from "@clerk/nextjs";
import { useTheme } from "next-themes";
import { User, Sun, Moon, Sparkles } from "lucide-react";
import { useHasNewChangelog } from "@/components/features/changelog/whats-new-dialog";
import { useIsMounted } from "@/hooks/use-is-mounted";

/**
 * `onOpenWhatsNew` is a callback rather than local state on purpose. This
 * component is rendered inside the mobile "More" Sheet, and Clerk's menu is
 * portaled outside that Sheet's DOM — so clicking a Clerk menu item counts as a
 * pointer-down outside the Sheet and dismisses it. A dialog owned here would be
 * a React child of the Sheet and unmount along with it, which is exactly how it
 * used to open and then disappear a beat later. The dialog lives in AppShell so
 * its lifetime is independent of the Sheet's.
 */
export function UserNav({ onOpenWhatsNew }: { onOpenWhatsNew: () => void }) {
  const hasClerk = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const { resolvedTheme, setTheme } = useTheme();
  const { hasNew, markSeen } = useHasNewChangelog();
  const mounted = useIsMounted();

  if (!hasClerk) {
    return (
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
        <User className="h-4 w-4 text-muted-foreground" />
      </div>
    );
  }

  const isDark = resolvedTheme === "dark";
  const themeLabel = mounted
    ? isDark
      ? "Switch to light mode"
      : "Switch to dark mode"
    : "Theme";
  const ThemeIcon = mounted && isDark ? Sun : Moon;

  return (
    <>
      <div className="relative">
        <UserButton
          afterSignOutUrl="/"
          appearance={{
            elements: {
              avatarBox: "h-8 w-8",
            },
          }}
        >
          <UserButton.MenuItems>
            <UserButton.Action
              label={themeLabel}
              labelIcon={<ThemeIcon className="h-4 w-4" />}
              onClick={() => setTheme(isDark ? "light" : "dark")}
            />
            <UserButton.Action
              label={hasNew ? "What's new ·" : "What's new"}
              labelIcon={<Sparkles className="h-4 w-4" />}
              onClick={() => {
                onOpenWhatsNew();
                markSeen();
              }}
            />
          </UserButton.MenuItems>
        </UserButton>
        {hasNew && (
          <span
            className="pointer-events-none absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-card"
            aria-hidden
          />
        )}
      </div>
    </>
  );
}
