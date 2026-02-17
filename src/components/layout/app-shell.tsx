"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Brain,
  ListTodo,
  Calendar,
  Settings,
  Download,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { UserNav } from "@/components/layout/user-nav";
import { Logo } from "@/components/ui/logo";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { NotificationBell } from "@/components/features/notifications/notification-bell";
import { useInstallPrompt } from "@/hooks/use-install-prompt";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dump", label: "Brain Dump", icon: Brain },
  { href: "/tasks", label: "Tasks", icon: ListTodo },
  { href: "/calendar", label: "Calendar", icon: Calendar },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { canInstall, promptInstall } = useInstallPrompt();
  const [installDismissed, setInstallDismissed] = useState(false);

  return (
    <div className="flex min-h-screen flex-col">
      {/* PWA install banner — mobile only */}
      {canInstall && !installDismissed && (
        <div className="flex items-center justify-between gap-3 border-b border-border bg-primary/5 px-4 py-2.5 md:hidden">
          <button
            onClick={async () => {
              const accepted = await promptInstall();
              if (!accepted) setInstallDismissed(true);
            }}
            className="flex items-center gap-2 text-sm"
          >
            <Download className="h-4 w-4 text-primary" />
            <span>
              Install <span className="font-medium">ControlledChaos</span> for a better experience
            </span>
          </button>
          <button
            onClick={() => setInstallDismissed(true)}
            className="shrink-0 text-muted-foreground hover:text-foreground"
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
        </nav>

        <div className="flex items-center justify-between border-t border-border p-4">
          <UserNav />
          <div className="flex items-center gap-1">
            <NotificationBell />
            <ThemeToggle />
          </div>
        </div>
      </aside>

      {/* Mobile bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around border-t border-border bg-card backdrop-blur-xl py-2 md:hidden">
        {navItems.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center gap-1 rounded-lg px-2 py-1.5 text-xs transition-colors",
                isActive
                  ? "text-primary"
                  : "text-muted-foreground"
              )}
            >
              <item.icon className="h-5 w-5" />
              <span>{item.label}</span>
            </Link>
          );
        })}
        <div className="flex flex-col items-center gap-1 px-2 py-1.5">
          <NotificationBell />
          <span className="text-xs text-muted-foreground">Alerts</span>
        </div>
        <div className="flex flex-col items-center gap-1 px-2 py-1.5">
          <UserNav />
          <span className="text-xs text-muted-foreground">Account</span>
        </div>
      </nav>

      {/* Main content */}
      <main className="flex-1 overflow-auto pb-20 md:pb-0">
        <div className="mx-auto max-w-4xl px-4 py-4 sm:p-6">{children}</div>
      </main>
      </div>
    </div>
  );
}
