"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { Command } from "cmdk";
import {
  LayoutDashboard,
  Brain,
  ListTodo,
  Repeat,
  Target,
  Calendar,
  Clock,
  BookOpen,
  Settings,
  Siren,
  TrendingUp,
  Plus,
  Sparkles,
  Sun,
  Moon,
  User,
  Bell,
  MapPin,
  Pill,
  Users,
  Flame,
  Search,
  ArrowRight,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { VisuallyHidden } from "radix-ui";
import { cn } from "@/lib/utils";
import type { Task } from "@/types";

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNewTask?: () => void;
  onPlanMyDay?: () => void;
}

interface NavItem {
  id: string;
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  keywords?: string;
}

interface SettingsItem {
  id: string;
  label: string;
  /** Anchor id of the settings card on /settings, or null for top of page. */
  anchor: string | null;
  icon: React.ComponentType<{ className?: string }>;
  keywords?: string;
}

const NAV_ITEMS: NavItem[] = [
  { id: "nav-dashboard", label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, keywords: "home overview" },
  { id: "nav-dump", label: "Brain Dump", href: "/dump", icon: Brain, keywords: "capture thoughts" },
  { id: "nav-tasks", label: "Tasks", href: "/tasks", icon: ListTodo, keywords: "todo list" },
  { id: "nav-microtasks", label: "Microtasks", href: "/microtasks", icon: Repeat, keywords: "habits daily prompts" },
  { id: "nav-goals", label: "Goals", href: "/goals", icon: Target, keywords: "long term" },
  { id: "nav-momentum", label: "Momentum", href: "/momentum", icon: TrendingUp, keywords: "stats progress streak weekly" },
  { id: "nav-calendar", label: "Calendar", href: "/calendar", icon: Calendar, keywords: "schedule events" },
  { id: "nav-recap", label: "Daily Recap", href: "/recap", icon: Clock, keywords: "mirror journal day review" },
  { id: "nav-journal", label: "Journal", href: "/journal", icon: BookOpen, keywords: "writing notes" },
  { id: "nav-settings", label: "Settings", href: "/settings", icon: Settings, keywords: "preferences config" },
  { id: "nav-crisis", label: "Crisis Mode", href: "/crisis", icon: Siren, keywords: "panic emergency support" },
];

const SETTINGS_ITEMS: SettingsItem[] = [
  { id: "set-display-name", label: "Display Name", anchor: "display-name", icon: User, keywords: "name profile" },
  { id: "set-timezone", label: "Timezone", anchor: "timezone", icon: Clock, keywords: "tz region" },
  { id: "set-appearance", label: "Appearance", anchor: "appearance", icon: Sun, keywords: "theme dark light celebration density" },
  { id: "set-friends", label: "Friends", anchor: "friends", icon: Users, keywords: "social parallel play" },
  { id: "set-rooms", label: "Parallel Play rooms", anchor: "rooms", icon: Flame, keywords: "body double focus session" },
  { id: "set-ai", label: "AI Personality", anchor: "ai-personality", icon: Brain, keywords: "energy assistant claude" },
  { id: "set-notifications", label: "Notifications", anchor: "notifications", icon: Bell, keywords: "push email digest reminders quiet hours" },
  { id: "set-calendar", label: "Calendar Integration", anchor: "calendar", icon: Calendar, keywords: "ical canvas sources colors week start" },
  { id: "set-locations", label: "Saved Locations", anchor: "locations", icon: MapPin, keywords: "places geofence map" },
  { id: "set-commute", label: "Commute Times", anchor: "commute", icon: Clock, keywords: "travel commute drive transit" },
  { id: "set-crisis", label: "Crisis Detection", anchor: "crisis-detection", icon: Siren, keywords: "safety panic emergency" },
  { id: "set-medications", label: "Medications", anchor: "medications", icon: Pill, keywords: "meds schedule reminders" },
];

const RECENT_KEY = "cc-palette-recent";
const RECENT_MAX = 5;

function getRecent(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function pushRecent(id: string) {
  try {
    const cur = getRecent();
    const next = [id, ...cur.filter((x) => x !== id)].slice(0, RECENT_MAX);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {}
}

export function CommandPalette({
  open,
  onOpenChange,
  onNewTask,
  onPlanMyDay,
}: CommandPaletteProps) {
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const [query, setQuery] = useState("");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [recentIds, setRecentIds] = useState<string[]>([]);

  // Fetch tasks once when palette opens; cache for the session.
  useEffect(() => {
    if (!open) return;
    setRecentIds(getRecent());
    if (tasks.length > 0) return;
    fetch("/api/tasks")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.tasks && Array.isArray(data.tasks)) {
          setTasks(data.tasks as Task[]);
        }
      })
      .catch(() => {});
  }, [open, tasks.length]);

  // Reset query when closing
  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const close = useCallback(() => onOpenChange(false), [onOpenChange]);

  const run = useCallback(
    (id: string, fn: () => void) => {
      pushRecent(id);
      close();
      fn();
    },
    [close]
  );

  const activeTasks = useMemo(
    () => tasks.filter((t) => t.status !== "completed").slice(0, 50),
    [tasks]
  );

  const allItems = useMemo(() => {
    const map = new Map<string, { label: string; run: () => void }>();
    NAV_ITEMS.forEach((n) =>
      map.set(n.id, { label: n.label, run: () => router.push(n.href) })
    );
    SETTINGS_ITEMS.forEach((s) =>
      map.set(s.id, {
        label: s.label,
        run: () =>
          router.push(s.anchor ? `/settings#${s.anchor}` : "/settings"),
      })
    );
    return map;
  }, [router]);

  const recentEntries = useMemo(
    () =>
      recentIds
        .map((id) => {
          const entry = allItems.get(id);
          return entry ? { id, ...entry } : null;
        })
        .filter((x): x is { id: string; label: string; run: () => void } => x !== null),
    [recentIds, allItems]
  );

  const isDark = resolvedTheme === "dark";
  const showRecent = !query && recentEntries.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="overflow-hidden p-0 sm:max-w-xl"
        showCloseButton={false}
      >
        <VisuallyHidden.Root>
          <DialogTitle>Command palette</DialogTitle>
          <DialogDescription>
            Search and jump to any page, task, or action.
          </DialogDescription>
        </VisuallyHidden.Root>

        <Command label="Command palette" className="flex flex-col">
          <div className="flex items-center gap-2 border-b border-border px-3">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <Command.Input
              value={query}
              onValueChange={setQuery}
              placeholder="Jump to… type to search"
              className="flex h-12 flex-1 bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground"
              autoFocus
            />
            <kbd className="hidden rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground sm:inline">
              Esc
            </kbd>
          </div>

          <Command.List className="max-h-[60vh] overflow-y-auto overscroll-contain p-1">
            <Command.Empty className="py-6 text-center text-sm text-muted-foreground">
              No matches.
            </Command.Empty>

            {showRecent && (
              <Command.Group
                heading="Recent"
                className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground"
              >
                {recentEntries.map((r) => (
                  <CommandRow
                    key={`recent-${r.id}`}
                    value={`recent ${r.label}`}
                    onSelect={() => run(r.id, r.run)}
                    icon={<Clock className="h-4 w-4 text-muted-foreground" />}
                    label={r.label}
                  />
                ))}
              </Command.Group>
            )}

            <Command.Group
              heading="Actions"
              className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground"
            >
              {onNewTask && (
                <CommandRow
                  value="new task add create"
                  onSelect={() => run("act-new-task", () => onNewTask())}
                  icon={<Plus className="h-4 w-4" />}
                  label="New task"
                  hint="⌘N"
                />
              )}
              <CommandRow
                value="brain dump capture"
                onSelect={() => run("nav-dump", () => router.push("/dump"))}
                icon={<Brain className="h-4 w-4" />}
                label="Brain Dump"
                hint="⌘D"
              />
              {onPlanMyDay && (
                <CommandRow
                  value="plan my day schedule ai"
                  onSelect={() => run("act-plan-day", () => onPlanMyDay())}
                  icon={<Sparkles className="h-4 w-4" />}
                  label="Plan my day"
                />
              )}
              <CommandRow
                value={`toggle theme ${isDark ? "light" : "dark"} mode`}
                onSelect={() =>
                  run("act-toggle-theme", () => setTheme(isDark ? "light" : "dark"))
                }
                icon={isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                label={isDark ? "Switch to light mode" : "Switch to dark mode"}
              />
            </Command.Group>

            <Command.Group
              heading="Pages"
              className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground"
            >
              {NAV_ITEMS.map((n) => (
                <CommandRow
                  key={n.id}
                  value={`${n.label} ${n.keywords ?? ""}`}
                  onSelect={() => run(n.id, () => router.push(n.href))}
                  icon={<n.icon className="h-4 w-4" />}
                  label={n.label}
                />
              ))}
            </Command.Group>

            <Command.Group
              heading="Settings"
              className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground"
            >
              {SETTINGS_ITEMS.map((s) => (
                <CommandRow
                  key={s.id}
                  value={`${s.label} settings ${s.keywords ?? ""}`}
                  onSelect={() =>
                    run(s.id, () =>
                      router.push(s.anchor ? `/settings#${s.anchor}` : "/settings")
                    )
                  }
                  icon={<s.icon className="h-4 w-4" />}
                  label={s.label}
                />
              ))}
            </Command.Group>

            {activeTasks.length > 0 && (
              <Command.Group
                heading="Tasks"
                className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground"
              >
                {activeTasks.map((t) => (
                  <CommandRow
                    key={`task-${t.id}`}
                    value={`task ${t.title} ${t.description ?? ""} ${t.category ?? ""}`}
                    onSelect={() =>
                      run(`task-${t.id}`, () => router.push(`/tasks?taskId=${t.id}`))
                    }
                    icon={<ListTodo className="h-4 w-4 text-muted-foreground" />}
                    label={t.title}
                    hint={<ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />}
                  />
                ))}
              </Command.Group>
            )}
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  );
}

interface CommandRowProps {
  value: string;
  onSelect: () => void;
  icon: React.ReactNode;
  label: string;
  hint?: React.ReactNode;
}

function CommandRow({ value, onSelect, icon, label, hint }: CommandRowProps) {
  return (
    <Command.Item
      value={value}
      onSelect={onSelect}
      className={cn(
        "flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-2 text-sm text-foreground",
        "data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground",
        "aria-disabled:pointer-events-none aria-disabled:opacity-50"
      )}
    >
      <span className="flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground">
        {icon}
      </span>
      <span className="flex-1 truncate">{label}</span>
      {hint && (
        <span className="shrink-0 text-xs text-muted-foreground">{hint}</span>
      )}
    </Command.Item>
  );
}
