"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Type, Mic, Camera, BookOpen, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { DumpInput } from "@/components/features/brain-dump/dump-input";
import { VoiceRecorder } from "@/components/features/brain-dump/voice-recorder";
import { PhotoUploader } from "@/components/features/brain-dump/photo-uploader";
import { DumpHistory } from "@/components/features/brain-dump/dump-history";
import { JournalCompose } from "@/components/features/brain-dump/journal-compose";
import { PageHeader } from "@/components/ui/page-header";
import type { DumpCategory } from "@/types";

type InputMode = "text" | "voice" | "photo";

export default function BrainDumpPage() {
  const searchParams = useSearchParams();
  const initialCategory: DumpCategory =
    searchParams.get("category") === "junk_journal" ? "junk_journal" : "braindump";

  const [mode, setMode] = useState<InputMode>("text");
  const [category, setCategory] = useState<DumpCategory>(initialCategory);
  const [historyKey, setHistoryKey] = useState(0);
  const refreshHistory = () => setHistoryKey((k) => k + 1);

  return (
    <div className="space-y-6">
      <PageHeader
        title={category === "braindump" ? "Brain Dump" : "Junk Journal"}
        description={
          category === "braindump" ? (
            <>
              Just start{" "}
              {mode === "text"
                ? "typing"
                : mode === "voice"
                  ? "talking"
                  : "snapping"}
              . Messy is fine.
              I&apos;ll sort it out.
            </>
          ) : (
            <>
              A space for longer writing — drafts, journal entries, raw thoughts.
              Saved and summarized, but not parsed for tasks or events.
            </>
          )
        }
      />

      {/* Category toggle */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setCategory("braindump")}
          aria-pressed={category === "braindump"}
          className={cn(
            "flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition-colors",
            category === "braindump"
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground"
          )}
        >
          <Zap className="h-4 w-4" />
          Brain Dump
        </button>
        <button
          onClick={() => setCategory("junk_journal")}
          aria-pressed={category === "junk_journal"}
          className={cn(
            "flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition-colors",
            category === "junk_journal"
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground"
          )}
        >
          <BookOpen className="h-4 w-4" />
          Junk Journal
        </button>
      </div>

      {/* Mode toggle — Brain Dump only; Junk Journal uses the unified compose surface */}
      {category === "braindump" && (
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMode("text")}
            aria-pressed={mode === "text"}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition-colors",
              mode === "text"
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground"
            )}
          >
            <Type className="h-4 w-4" />
            Text
          </button>
          <button
            onClick={() => setMode("voice")}
            aria-pressed={mode === "voice"}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition-colors",
              mode === "voice"
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground"
            )}
          >
            <Mic className="h-4 w-4" />
            Voice
          </button>
          <button
            onClick={() => setMode("photo")}
            aria-pressed={mode === "photo"}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition-colors",
              mode === "photo"
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground"
            )}
          >
            <Camera className="h-4 w-4" />
            Photo
          </button>
        </div>
      )}

      {category === "junk_journal" ? (
        <JournalCompose onSaved={refreshHistory} />
      ) : mode === "text" ? (
        <DumpInput category={category} onSaved={refreshHistory} />
      ) : mode === "voice" ? (
        <VoiceRecorder category={category} onSaved={refreshHistory} />
      ) : (
        <PhotoUploader category={category} onSaved={refreshHistory} />
      )}

      <DumpHistory key={historyKey} />
    </div>
  );
}
