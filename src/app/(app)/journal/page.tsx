"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  BookOpen,
  Camera,
  ChevronDown,
  ChevronUp,
  Mic,
  Type,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatForDisplay } from "@/lib/timezone";
import { useTimezone } from "@/hooks/use-timezone";

interface JournalEntry {
  id: string;
  inputType: "text" | "voice" | "photo";
  rawContent: string | null;
  mediaUrl: string | null;
  media?: string[];
  summary: string | null;
  createdAt: string;
}

const PAGE_SIZE = 20;

const inputTypeIcon = { text: Type, voice: Mic, photo: Camera } as const;

function formatFullDate(dateStr: string, timezone: string): string {
  return formatForDisplay(new Date(dateStr), timezone, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function JournalPage() {
  const timezone = useTimezone();
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [isLoadingInitial, setIsLoadingInitial] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);

  const loadPage = useCallback(
    async (offset: number, append: boolean) => {
      const setLoading = append ? setIsLoadingMore : setIsLoadingInitial;
      setLoading(true);
      setLoadError(false);
      try {
        const res = await fetch(
          `/api/dump/history?category=junk_journal&limit=${PAGE_SIZE}&offset=${offset}`
        );
        if (!res.ok) throw new Error();
        const data = (await res.json()) as { dumps?: JournalEntry[] };
        const next = data.dumps ?? [];
        setEntries((prev) => (append ? [...prev, ...next] : next));
        setHasMore(next.length === PAGE_SIZE);
      } catch {
        setLoadError(true);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    loadPage(0, false);
  }, [loadPage]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Journal</h1>
        <p className="text-muted-foreground">
          Everything you&apos;ve saved in Junk Journal. Reverse-chronological —
          most recent first.
        </p>
      </div>

      {isLoadingInitial ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full rounded-lg" />
          <Skeleton className="h-24 w-full rounded-lg" />
          <Skeleton className="h-24 w-full rounded-lg" />
        </div>
      ) : loadError ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Couldn&apos;t load journal entries. Try refreshing.
        </p>
      ) : entries.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          <div className="space-y-4">
            {entries.map((entry) => (
              <EntryCard
                key={entry.id}
                entry={entry}
                timezone={timezone}
                isExpanded={expandedId === entry.id}
                onToggle={() =>
                  setExpandedId(expandedId === entry.id ? null : entry.id)
                }
              />
            ))}
          </div>

          {hasMore && (
            <div className="pt-2 text-center">
              <Button
                variant="outline"
                onClick={() => loadPage(entries.length, true)}
                disabled={isLoadingMore}
              >
                {isLoadingMore ? "Loading..." : "Load more"}
              </Button>
            </div>
          )}

          {!hasMore && entries.length > PAGE_SIZE && (
            <p className="pt-2 text-center text-xs text-muted-foreground">
              That&apos;s all of them.
            </p>
          )}
        </>
      )}
    </div>
  );
}

interface EntryCardProps {
  entry: JournalEntry;
  timezone: string;
  isExpanded: boolean;
  onToggle: () => void;
}

function EntryCard({ entry, timezone, isExpanded, onToggle }: EntryCardProps) {
  const Icon = inputTypeIcon[entry.inputType] ?? Type;
  const hasContent = !!entry.rawContent;
  const media = entry.media ?? (entry.mediaUrl ? [entry.mediaUrl] : []);
  const hasMedia = media.length > 0;

  return (
    <article className="rounded-lg border border-border bg-card p-5 transition-colors">
      <header className="mb-3 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Icon className="h-3.5 w-3.5" aria-hidden />
          <time dateTime={entry.createdAt}>
            {formatFullDate(entry.createdAt, timezone)}
          </time>
          {hasMedia && (
            <span>· {media.length} photo{media.length !== 1 ? "s" : ""}</span>
          )}
        </div>
      </header>

      {entry.summary && (
        <p className="text-sm italic text-muted-foreground">
          {entry.summary}
        </p>
      )}

      {hasMedia && (
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {media.map((url, i) => (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              key={url}
              src={url}
              alt={`Attachment ${i + 1}`}
              className="h-40 w-full rounded-md object-cover"
            />
          ))}
        </div>
      )}

      {hasContent && (
        <>
          <button
            type="button"
            onClick={onToggle}
            className={cn(
              "mt-3 flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            )}
            aria-expanded={isExpanded}
          >
            {isExpanded ? (
              <>
                Hide full text <ChevronUp className="h-3 w-3" />
              </>
            ) : (
              <>
                Read full text <ChevronDown className="h-3 w-3" />
              </>
            )}
          </button>

          {isExpanded && (
            <div className="mt-3 rounded-md bg-muted/40 p-4">
              <p className="whitespace-pre-wrap text-[15px] leading-7 text-foreground">
                {entry.rawContent}
              </p>
            </div>
          )}
        </>
      )}
    </article>
  );
}

function EmptyState() {
  return (
    <div className="rounded-lg border border-dashed border-border px-6 py-12 text-center">
      <BookOpen
        className="mx-auto mb-3 h-6 w-6 text-muted-foreground/70"
        aria-hidden
      />
      <p className="text-sm font-medium text-muted-foreground">
        No journal entries yet
      </p>
      <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
        Junk Journal is for longer writing — drafts, thoughts, paragraphs you
        want to keep without turning them into tasks.
      </p>
      <Link
        href="/dump"
        className="mt-4 inline-block text-xs font-medium text-primary hover:underline"
      >
        Start one →
      </Link>
    </div>
  );
}
