"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useGeofenceTracker } from "@/hooks/use-geofence-tracker";
import { useCrisisDetection } from "@/hooks/use-crisis-detection";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import {
  LayoutDashboard,
  Brain,
  ListTodo,
  Target,
  Calendar,
  Clock,
  Settings,
  Download,
  X,
  Menu,
  Siren,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
import { UserNav } from "@/components/layout/user-nav";
import { Logo } from "@/components/ui/logo";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { NotificationBell } from "@/components/features/notifications/notification-bell";
import { WhatsNewDialog } from "@/components/features/changelog/whats-new-dialog";
import { ShortcutsDialog } from "@/components/features/shortcuts/shortcuts-dialog";
import { CreateTaskModal } from "@/components/features/task-feed/create-task-modal";
import { MomentsBar, MomentsSidebarGroup } from "@/components/features/moments/moments-bar";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useInstallPrompt } from "@/hooks/use-install-prompt";
import { LegalFooter } from "@/components/layout/legal-footer";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dump", label: "Brain Dump", mobileLabel: "Dump", icon: Brain },
  { href: "/tasks", label: "Tasks", icon: ListTodo },
  { href: "/goals", label: "Goals", icon: Target },
  { href: "/calendar", label: "Calendar", icon: Calendar },
  { href: "/mirror", label: "Mirror", icon: Clock },
  { href: "/settings", label: "Settings", icon: Settings },
];

const mobileNavItems = [
  { href: "/dashboard", label: "Dash", icon: LayoutDashboard },
  { href: "/crisis", label: "Crisis", icon: Siren },
  { href: "/calendar", label: "Calendar", icon: Calendar },
];

const mobileMoreItems = [
  { href: "/dump", label: "Brain Dump", icon: Brain },
  { href: "/tasks", label: "Tasks", icon: ListTodo },
  { href: "/goals", label: "Goals", icon: Target },
  { href: "/mirror", label: "Mirror", icon: Clock },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { canInstall, isIOS, isInstalled, promptInstall } = useInstallPrompt();
  const [installDismissed, setInstallDismissed] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("cc-install-dismissed") === "1";
  });

  // Keyboard shortcut dialogs
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showCreateTask, setShowCreateTask] = useState(false);
  const toggleShortcuts = useCallback(() => setShowShortcuts((v) => !v), []);
  const openCreateTask = useCallback(() => setShowCreateTask(true), []);
  useKeyboardShortcuts({ onNewTask: openCreateTask, onToggleShortcuts: toggleShortcuts });

  // Crisis detection badge state
  const { isActive: crisisActive } = useCrisisDetection();

  // Geofence tracker — fetch setting once, then track passively
  const [locationEnabled, setLocationEnabled] = useState(false);
  useEffect(() => {
    fetch("/api/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.notificationPrefs?.locationNotificationsEnabled) {
          setLocationEnabled(true);
        }
      })
      .catch(() => {});
  }, []);
  useGeofenceTracker(locationEnabled);

  function dismissInstall() {
    localStorage.setItem("cc-install-dismissed", "1");
    setInstallDismissed(true);
  }

  return (
    <div className="flex min-h-screen flex-col">
      {/* PWA install banner — mobile only */}
      {canInstall && !installDismissed && (
        <div className="flex items-center justify-between gap-3 border-b border-border bg-primary/5 px-4 py-2.5 md:hidden">
          <button
            onClick={async () => {
              const accepted = await promptInstall();
              if (!accepted) dismissInstall();
            }}
            className="flex items-center gap-2 text-sm"
          >
            <Download className="h-4 w-4 text-primary" />
            <span>
              Install <span className="font-medium">ControlledChaos</span> for a better experience
            </span>
          </button>
          <button
            onClick={dismissInstall}
            className="shrink-0 text-muted-foreground hover:text-foreground"
            aria-label="Dismiss install prompt"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* iOS Safari install instructions */}
      {isIOS && !isInstalled && !installDismissed && !canInstall && (
        <div className="flex items-center justify-between gap-3 border-b border-border bg-primary/5 px-4 py-2.5 md:hidden">
          <p className="text-sm">
            <Download className="mr-1.5 inline h-4 w-4 text-primary" />
            Tap <span className="font-medium">Share</span> then{" "}
            <span className="font-medium">Add to Home Screen</span> to install
          </p>
          <button
            onClick={dismissInstall}
            className="shrink-0 text-muted-foreground hover:text-foreground"
            aria-label="Dismiss install prompt"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="flex flex-1">
      {/* Sidebar — hidden on mobile, shown on md+ */}
      <aside className="hidden md:flex w-64 flex-col border-r border-border bg-card backdrop-blur-xl sticky top-0 h-screen">
        <div className="flex h-14 items-center gap-2 border-b border-border px-6">
          <Logo className="h-5 w-5" />
          <span className="font-semibold tracking-tight">ControlledChaos</span>
        </div>

        <nav className="flex-1 space-y-1 p-3">
          {navItems.map((item) => {
            const isActive = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                  isActive
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
          <Separator className="my-1" />
          <Link
            href="/crisis"
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
              pathname.startsWith("/crisis")
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
            )}
          >
            <span className="relative">
              <Siren className="h-4 w-4" />
              {crisisActive && (
                <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-destructive" />
              )}
            </span>
            Crisis Mode
          </Link>
        </nav>

        <MomentsSidebarGroup />

        <div className="flex flex-col border-t border-border p-4 gap-3">
          <div className="flex items-center justify-between">
            <UserNav />
            <div className="flex items-center gap-1">
              <WhatsNewDialog />
              <NotificationBell />
              <ThemeToggle />
            </div>
          </div>
          <LegalFooter />
        </div>
      </aside>

      {/* Mobile bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 flex items-center gap-1 border-t border-border bg-card px-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl md:hidden">
        {mobileNavItems.map((item) => {
          const isActive = pathname.startsWith(item.href);
          const showCrisisBadge = item.href === "/crisis" && crisisActive;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex min-w-0 flex-1 flex-col items-center gap-1 rounded-lg px-1 py-1.5 text-xs transition-colors",
                isActive
                  ? "text-primary"
                  : "text-muted-foreground"
              )}
            >
              <span className="relative">
                <item.icon className="h-5 w-5" />
                {showCrisisBadge && (
                  <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-destructive" />
                )}
              </span>
              <span className="block text-center leading-tight">{item.label}</span>
            </Link>
          );
        })}
        <Sheet>
          <SheetTrigger asChild>
            <button
              type="button"
              className="flex min-w-0 flex-1 flex-col items-center gap-1 rounded-lg px-1 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
              aria-label="Open more options"
            >
              <Menu className="h-5 w-5" />
              <span className="block text-center leading-tight">More</span>
            </button>
          </SheetTrigger>
          <SheetContent
            side="bottom"
            className="rounded-t-2xl pb-[calc(1rem+env(safe-area-inset-bottom))] md:hidden"
          >
            <SheetHeader className="pb-2">
              <SheetTitle>More</SheetTitle>
              <SheetDescription>
                Quick access to all your tools.
              </SheetDescription>
            </SheetHeader>

            <div className="space-y-2 px-4">
              {mobileMoreItems.map((item) => (
                <SheetClose asChild key={item.href}>
                  <Link
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 rounded-lg border border-border px-3 py-2.5 text-sm font-medium transition-colors",
                      pathname.startsWith(item.href)
                        ? "border-primary/30 bg-primary/5 text-foreground"
                        : "hover:bg-accent/50"
                    )}
                  >
                    <item.icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                </SheetClose>
              ))}
            </div>

            <div className="grid grid-cols-4 gap-3 px-4 pt-3">
              <div className="flex flex-col items-center gap-1 rounded-lg border border-border px-2 py-2">
                <WhatsNewDialog />
                <span className="text-xs text-muted-foreground">New</span>
              </div>
              <div className="flex flex-col items-center gap-1 rounded-lg border border-border px-2 py-2">
                <NotificationBell />
                <span className="text-xs text-muted-foreground">Alerts</span>
              </div>
              <div className="flex flex-col items-center gap-1 rounded-lg border border-border px-2 py-2">
                <UserNav />
                <span className="text-xs text-muted-foreground">Account</span>
              </div>
              <div className="flex flex-col items-center gap-1 rounded-lg border border-border px-2 py-2">
                <ThemeToggle />
                <span className="text-xs text-muted-foreground">Theme</span>
              </div>
            </div>
            <div className="px-4 pt-4 pb-1 border-t border-border mt-2">
              <LegalFooter />
            </div>
          </SheetContent>
        </Sheet>
      </nav>

      {/* Main content — padded on mobile to clear both the bottom nav and the Moments strip above it */}
      <main className="flex-1 overflow-auto pb-[calc(8.5rem+env(safe-area-inset-bottom))] md:pb-0">
        <div className="mx-auto max-w-4xl px-4 py-4 sm:p-6">{children}</div>
      </main>
      </div>

      {/* Moments chip-bar — mobile only (desktop variant lives inside the sidebar) */}
      <MomentsBar />

      {/* Global dialogs triggered by keyboard shortcuts */}
      <ShortcutsDialog open={showShortcuts} onClose={() => setShowShortcuts(false)} />
      <CreateTaskModal
        open={showCreateTask}
        onClose={() => setShowCreateTask(false)}
        onCreated={() => {
          setShowCreateTask(false);
          // Refresh happens via router in the modal's onCreated flow
        }}
      />
    </div>
  );
}
