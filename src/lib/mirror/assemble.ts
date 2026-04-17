import type {
  DumpInputType,
  MirrorEntry,
  MirrorKind,
  MomentType,
} from "@/types";

// ============================================================
// Pure row shapes — mirror what the DB queries return, but not tied
// to Drizzle's row types so this module stays DB-free (and testable).
// ============================================================

export interface TaskRow {
  id: string;
  title: string;
  category: string | null;
  completedAt: Date | null;
}

export interface EventRow {
  id: string;
  title: string;
  location: string | null;
  startTime: Date;
  endTime: Date;
  isAllDay: boolean | null;
}

export interface DumpRow {
  id: string;
  inputType: string;
  aiResponse: unknown;
  createdAt: Date;
}

export interface MomentRow {
  id: string;
  type: string;
  intensity: number | null;
  note: string | null;
  occurredAt: Date;
}

export interface MedLogRow {
  id: string;
  medicationId: string;
  takenAt: Date;
}

export interface AssembleInput {
  tasks: TaskRow[];
  events: EventRow[];
  dumps: DumpRow[];
  journal: DumpRow[];
  moments: MomentRow[];
  medLogs: MedLogRow[];
  /** medication_id → { name, dosage } */
  medLookup: Map<string, { name: string; dosage: string }>;
  /** Optional kind filter. When omitted, all kinds are included. */
  typeFilters?: MirrorKind[];
}

/**
 * Merge pre-fetched rows into MirrorEntries and sort reverse-chronologically.
 * Pure — no DB, no timezone math, no side effects. Filter is applied here
 * as a safety net even if the caller already skipped the corresponding query.
 */
export function assembleMirrorEntries(input: AssembleInput): MirrorEntry[] {
  const want = (k: MirrorKind) =>
    !input.typeFilters || input.typeFilters.includes(k);

  const entries: MirrorEntry[] = [];

  if (want("task")) {
    for (const t of input.tasks) {
      if (!t.completedAt) continue;
      entries.push({
        kind: "task",
        id: t.id,
        at: t.completedAt.toISOString(),
        title: t.title,
        category: t.category,
      });
    }
  }

  if (want("event")) {
    for (const e of input.events) {
      entries.push({
        kind: "event",
        id: e.id,
        at: e.startTime.toISOString(),
        endAt: e.endTime.toISOString(),
        title: e.title,
        location: e.location,
        isAllDay: e.isAllDay ?? false,
      });
    }
  }

  if (want("dump")) {
    for (const d of input.dumps) {
      entries.push({
        kind: "dump",
        id: d.id,
        at: d.createdAt.toISOString(),
        summary: extractDumpSummary(d.aiResponse),
        inputType: d.inputType as DumpInputType,
      });
    }
  }

  if (want("journal")) {
    for (const j of input.journal) {
      entries.push({
        kind: "journal",
        id: j.id,
        at: j.createdAt.toISOString(),
        summary: extractDumpSummary(j.aiResponse),
        inputType: j.inputType as DumpInputType,
      });
    }
  }

  if (want("moment")) {
    for (const m of input.moments) {
      entries.push({
        kind: "moment",
        id: m.id,
        at: m.occurredAt.toISOString(),
        type: m.type as MomentType,
        intensity: m.intensity,
        note: m.note,
      });
    }
  }

  if (want("med")) {
    for (const log of input.medLogs) {
      const med = input.medLookup.get(log.medicationId);
      if (!med) continue; // skip orphaned logs (shouldn't happen, but safe)
      entries.push({
        kind: "med",
        id: log.id,
        at: log.takenAt.toISOString(),
        medicationName: med.name,
        dosage: med.dosage,
      });
    }
  }

  // Reverse-chronological: most recent first
  entries.sort((a, b) => b.at.localeCompare(a.at));
  return entries;
}

function extractDumpSummary(aiResponse: unknown): string | null {
  if (!aiResponse || typeof aiResponse !== "object") return null;
  const s = (aiResponse as { summary?: unknown }).summary;
  return typeof s === "string" ? s : null;
}
