"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Pencil, Plus, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Markdown } from "@/components/ui/markdown";
import { LoadErrorStrip } from "@/components/ui/load-error-strip";
import { useCrisisDetection } from "@/hooks/use-crisis-detection";
import { useTimezone } from "@/hooks/use-timezone";
import { toUserLocal } from "@/lib/timezone";
import { isCardScheduledNow, type ChecklistReset } from "@/lib/reference-cards";

interface ReferenceCard {
  id: string;
  title: string;
  content: string;
  collapsed: boolean;
  daysOfWeek: number[] | null;
  showFrom: string | null;
  showUntil: string | null;
  checklistReset: ChecklistReset;
  checkedItems: number[];
}

type CardDraft = Pick<
  ReferenceCard,
  "title" | "content" | "daysOfWeek" | "showFrom" | "showUntil" | "checklistReset"
>;

const EMPTY_DRAFT: CardDraft = {
  title: "",
  content: "",
  daysOfWeek: null,
  showFrom: null,
  showUntil: null,
  checklistReset: "daily",
};

const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Pinned markdown playbooks — evening sequence, launch-pad checklist, decision
 * defaults. Quiet by design: loads on its own, renders nothing until it has
 * cards, and a failure here never holds up the rest of the dashboard.
 */
export function ReferenceCards() {
  const { isActive: crisisActive } = useCrisisDetection();
  const timezone = useTimezone();
  const [cards, setCards] = useState<ReferenceCard[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [showUnscheduled, setShowUnscheduled] = useState(false);
  // Re-evaluate schedules each minute so an evening card appears on time.
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const fetchCards = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch("/api/reference-cards");
      if (!res.ok) return false;
      const data = (await res.json()) as { cards: ReferenceCard[] };
      setCards(data.cards);
      setLoadError(false);
      return true;
    } catch (err) {
      console.error("[ReferenceCards] load failed:", err);
      return false;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (await fetchCards()) return;
      // One retry covers a cold start or a Neon connection blip.
      await new Promise((r) => setTimeout(r, 1000));
      if (cancelled || (await fetchCards())) return;
      if (!cancelled) setLoadError(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchCards]);

  const { scheduled, unscheduled } = useMemo(() => {
    if (!cards) return { scheduled: [], unscheduled: [] };
    const local = toUserLocal(new Date(now), timezone);
    const dayOfWeek = new Date(Date.UTC(local.year, local.month - 1, local.day)).getUTCDay();
    const minutes = local.hour * 60 + local.minute;
    const isOn = (c: ReferenceCard) => isCardScheduledNow(c, dayOfWeek, minutes);
    return { scheduled: cards.filter(isOn), unscheduled: cards.filter((c) => !isOn(c)) };
  }, [cards, now, timezone]);

  /** Replace one card in local state with what the server returned. */
  const replaceCard = (card: ReferenceCard) =>
    setCards((prev) => prev?.map((c) => (c.id === card.id ? card : c)) ?? prev);

  const patchCard = async (id: string, body: Partial<ReferenceCard>): Promise<ReferenceCard> => {
    const res = await fetch(`/api/reference-cards/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Couldn't save that card");
    return data.card as ReferenceCard;
  };

  const handleToggleCollapsed = async (card: ReferenceCard) => {
    replaceCard({ ...card, collapsed: !card.collapsed });
    try {
      await patchCard(card.id, { collapsed: !card.collapsed });
    } catch (err) {
      replaceCard(card);
      toast.error(err instanceof Error ? err.message : "Couldn't save that");
    }
  };

  const handleCheck = async (card: ReferenceCard, body: { index: number; checked: boolean } | { reset: true }) => {
    const optimistic =
      "reset" in body
        ? []
        : body.checked
          ? [...new Set([...card.checkedItems, body.index])]
          : card.checkedItems.filter((i) => i !== body.index);
    replaceCard({ ...card, checkedItems: optimistic });
    try {
      const res = await fetch(`/api/reference-cards/${card.id}/check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't save that tick");
      replaceCard(data.card);
    } catch (err) {
      replaceCard(card);
      toast.error(err instanceof Error ? err.message : "Couldn't save that tick");
    }
  };

  const handleSave = async (id: string | "new", draft: CardDraft) => {
    try {
      if (id === "new") {
        const res = await fetch("/api/reference-cards", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(draft),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Couldn't create that card");
        setCards((prev) => [...(prev ?? []), data.card]);
      } else {
        // Only what changed: re-sending unchanged content would clear the ticks.
        const card = cards?.find((c) => c.id === id);
        const changed = Object.fromEntries(
          (Object.keys(draft) as (keyof CardDraft)[])
            .filter((k) => JSON.stringify(draft[k]) !== JSON.stringify(card?.[k]))
            .map((k) => [k, draft[k]])
        ) as Partial<ReferenceCard>;
        if (Object.keys(changed).length > 0) replaceCard(await patchCard(id, changed));
      }
      setEditingId(null);
      toast.success(`'${draft.title.trim()}' saved`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save that card");
    }
  };

  const handleDelete = async (card: ReferenceCard) => {
    try {
      const res = await fetch(`/api/reference-cards/${card.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setCards((prev) => prev?.filter((c) => c.id !== card.id) ?? prev);
      setEditingId(null);
      toast.success(`'${card.title}' deleted`);
    } catch {
      toast.error("Couldn't delete that card");
    }
  };

  if (crisisActive) return null;
  if (loadError) {
    return <LoadErrorStrip message="Couldn't load your reference cards." onRetry={fetchCards} />;
  }
  if (cards === null) return null;

  if (cards.length === 0 && editingId === null) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-xl border border-border/40 bg-card/50 px-4 py-3 text-sm">
        <span className="text-muted-foreground">
          Reference cards keep routines you look up a lot, like an evening sequence or a
          launch-pad checklist.
        </span>
        <Button variant="ghost" size="sm" onClick={() => setEditingId("new")}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Add
        </Button>
      </div>
    );
  }

  const shown = showUnscheduled ? [...scheduled, ...unscheduled] : scheduled;

  return (
    <div className="space-y-3">
      {shown.map((card) =>
        editingId === card.id ? (
          <CardEditor
            key={card.id}
            initial={card}
            onSave={(draft) => handleSave(card.id, draft)}
            onCancel={() => setEditingId(null)}
            onDelete={() => handleDelete(card)}
          />
        ) : (
          <CardView
            key={card.id}
            card={card}
            dimmed={!scheduled.includes(card)}
            onToggleCollapsed={() => void handleToggleCollapsed(card)}
            onEdit={() => setEditingId(card.id)}
            onCheck={(body) => void handleCheck(card, body)}
          />
        )
      )}

      {editingId === "new" && (
        <CardEditor
          initial={EMPTY_DRAFT}
          onSave={(draft) => handleSave("new", draft)}
          onCancel={() => setEditingId(null)}
        />
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-muted-foreground">
        {unscheduled.length > 0 ? (
          <button
            type="button"
            onClick={() => setShowUnscheduled((v) => !v)}
            className="transition-colors hover:text-foreground"
          >
            {showUnscheduled
              ? "Hide cards not scheduled now"
              : `${unscheduled.length} more card${unscheduled.length === 1 ? "" : "s"} not scheduled now · Show`}
          </button>
        ) : (
          <span />
        )}
        {editingId !== "new" && (
          <button
            type="button"
            onClick={() => setEditingId("new")}
            className="flex items-center gap-1 transition-colors hover:text-foreground"
          >
            <Plus className="h-3.5 w-3.5" />
            Reference card
          </button>
        )}
      </div>
    </div>
  );
}

function scheduleLabel(card: Pick<ReferenceCard, "daysOfWeek" | "showFrom" | "showUntil">): string | null {
  const days = card.daysOfWeek?.map((d) => DAY_NAMES[d]).join(", ");
  const window =
    card.showFrom || card.showUntil
      ? `${card.showFrom ?? "00:00"}–${card.showUntil ?? "24:00"}`
      : null;
  return [days, window].filter(Boolean).join(" · ") || null;
}

function CardView({
  card,
  dimmed,
  onToggleCollapsed,
  onEdit,
  onCheck,
}: {
  card: ReferenceCard;
  dimmed: boolean;
  onToggleCollapsed: () => void;
  onEdit: () => void;
  onCheck: (body: { index: number; checked: boolean } | { reset: true }) => void;
}) {
  const checked = useMemo(() => new Set(card.checkedItems), [card.checkedItems]);
  const schedule = scheduleLabel(card);

  return (
    <div className={cn("rounded-xl border border-border/40 bg-card/50 p-3", dimmed && "opacity-70")}>
      <div className="flex items-center justify-between gap-2 px-1">
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-expanded={!card.collapsed}
          className="flex min-h-9 min-w-0 items-center gap-1.5 text-left text-sm font-medium transition-colors hover:text-foreground"
        >
          {card.collapsed ? (
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          )}
          <span className="truncate">{card.title}</span>
        </button>
        <div className="flex shrink-0 items-center gap-1">
          {schedule && (
            <span className="hidden text-xs text-muted-foreground sm:inline">{schedule}</span>
          )}
          <Button variant="ghost" size="icon" className="h-9 w-9" onClick={onEdit} aria-label={`Edit ${card.title}`}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {!card.collapsed && (
        <div className="space-y-2 px-1 pt-2 text-sm">
          {card.content.trim() ? (
            <Markdown checklist={{ checked, onToggle: (index, isChecked) => onCheck({ index, checked: isChecked }) }}>
              {card.content}
            </Markdown>
          ) : (
            <p className="text-muted-foreground">Nothing here yet. Tap the pencil to write it.</p>
          )}
          {checked.size > 0 && (
            <button
              type="button"
              onClick={() => onCheck({ reset: true })}
              className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <RotateCcw className="h-3 w-3" />
              Clear ticks
              {card.checklistReset === "daily" && <span>(they also clear at midnight)</span>}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function CardEditor({
  initial,
  onSave,
  onCancel,
  onDelete,
}: {
  initial: CardDraft;
  onSave: (draft: CardDraft) => Promise<void>;
  onCancel: () => void;
  onDelete?: () => Promise<void>;
}) {
  const [draft, setDraft] = useState<CardDraft>({
    title: initial.title,
    content: initial.content,
    daysOfWeek: initial.daysOfWeek,
    showFrom: initial.showFrom,
    showUntil: initial.showUntil,
    checklistReset: initial.checklistReset,
  });
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const update = <K extends keyof CardDraft>(key: K, value: CardDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const toggleDay = (day: number) => {
    const current = new Set(draft.daysOfWeek ?? []);
    if (current.has(day)) current.delete(day);
    else current.add(day);
    // No days picked means every day.
    update("daysOfWeek", current.size ? [...current].sort((a, b) => a - b) : null);
  };

  const run = async (fn: () => Promise<void>) => {
    setSaving(true);
    try {
      await fn();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3 rounded-xl border border-border/60 bg-card p-3">
      <Input
        value={draft.title}
        onChange={(e) => update("title", e.target.value)}
        placeholder="Card title (e.g. Launch pad)"
        aria-label="Card title"
        maxLength={200}
        autoFocus
      />
      <Textarea
        value={draft.content}
        onChange={(e) => update("content", e.target.value)}
        placeholder={"Markdown. Lines starting with - [ ] become tickable.\n\n- [ ] Bag packed\n- [ ] Keys by the door"}
        aria-label="Card content (markdown)"
        rows={10}
        className="font-mono text-xs"
      />

      <div className="space-y-1.5">
        <p className="text-xs text-muted-foreground">Show on (none picked = every day)</p>
        <div className="flex gap-1" role="group" aria-label="Days to show this card">
          {DAY_LABELS.map((label, day) => {
            const on = draft.daysOfWeek?.includes(day) ?? false;
            return (
              <button
                key={day}
                type="button"
                onClick={() => toggleDay(day)}
                aria-pressed={on}
                aria-label={DAY_NAMES[day]}
                className={cn(
                  "h-9 w-9 rounded-full border text-xs font-medium transition-colors",
                  on
                    ? "border-primary/40 bg-primary/15 text-primary"
                    : "border-border bg-muted/50 text-muted-foreground hover:bg-muted"
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1 text-xs text-muted-foreground">
          <span className="block">From</span>
          <Input
            type="time"
            value={draft.showFrom ?? ""}
            onChange={(e) => update("showFrom", e.target.value || null)}
            className="w-32"
          />
        </label>
        <label className="space-y-1 text-xs text-muted-foreground">
          <span className="block">Until</span>
          <Input
            type="time"
            value={draft.showUntil ?? ""}
            onChange={(e) => update("showUntil", e.target.value || null)}
            className="w-32"
          />
        </label>
        <label className="space-y-1 text-xs text-muted-foreground">
          <span className="block">Checklist resets</span>
          <select
            value={draft.checklistReset}
            onChange={(e) => update("checklistReset", e.target.value as ChecklistReset)}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground"
          >
            <option value="daily">Every day</option>
            <option value="manual">Only when I clear it</option>
          </select>
        </label>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          {onDelete &&
            (confirmDelete ? (
              <span className="flex items-center gap-2 text-xs">
                Delete this card?
                <Button variant="destructive" size="sm" disabled={saving} onClick={() => void run(onDelete)}>
                  Delete
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>
                  Keep
                </Button>
              </span>
            ) : (
              <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setConfirmDelete(true)}>
                Delete
              </Button>
            ))}
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={saving || !draft.title.trim()}
            onClick={() => void run(() => onSave(draft))}
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}
