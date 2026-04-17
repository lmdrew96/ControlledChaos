"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Mic, Square, Pause, Play, Loader2, RotateCcw, Send, AlertCircle } from "lucide-react";
import { Logo } from "@/components/ui/logo";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useVoiceRecorder } from "@/hooks/use-voice-recorder";
import { cn } from "@/lib/utils";
import type { DumpCategory } from "@/types";

type VoiceStage =
  | "ready"
  | "recording"
  | "transcribing"
  | "reviewing"
  | "parsing";

interface VoiceRecorderProps {
  category: DumpCategory;
}

export function VoiceRecorder({ category }: VoiceRecorderProps) {
  const router = useRouter();
  const {
    status: recorderStatus,
    durationSeconds,
    error: recorderError,
    audioBlob,
    isSupported,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    reset,
  } = useVoiceRecorder();

  const [stage, setStage] = useState<VoiceStage>("ready");
  const [transcript, setTranscript] = useState("");
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const transcribeTriggered = useRef(false);

  function formatDuration(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  // Auto-trigger transcription when recording stops and blob is available
  useEffect(() => {
    if (
      recorderStatus === "stopped" &&
      audioBlob &&
      !transcribeTriggered.current
    ) {
      transcribeTriggered.current = true;
      transcribeRecording(audioBlob);
    }
  }, [recorderStatus, audioBlob]); // eslint-disable-line react-hooks/exhaustive-deps

  async function transcribeRecording(blob: Blob) {
    setStage("transcribing");
    setError(null);

    try {
      const formData = new FormData();
      const extension = blob.type.includes("mp4") ? "m4a" : "webm";
      formData.append("audio", blob, `recording.${extension}`);

      const response = await fetch("/api/dump/voice/transcribe", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Transcription failed");
      }

      const data = await response.json();

      if (!data.transcript?.trim()) {
        throw new Error(
          "No speech detected. Try speaking louder or closer to the mic."
        );
      }

      setTranscript(data.transcript);
      setMediaUrl(data.mediaUrl);

      // Auto-parse immediately — no manual step needed
      await parseTranscript(data.transcript, data.mediaUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Transcription failed");
      setStage("ready");
      reset();
      transcribeTriggered.current = false;
    }
  }

  async function parseTranscript(text: string, url: string | null) {
    if (!text.trim()) return;

    setStage("parsing");
    setError(null);

    try {
      const response = await fetch("/api/dump/voice/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: text, mediaUrl: url, category }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            (category === "junk_journal"
              ? "Failed to save journal entry"
              : "Failed to parse brain dump")
        );
      }

      if (category === "junk_journal") {
        toast.success("Journal entry saved");
        router.push("/journal");
        router.refresh();
        return;
      }

      const taskCount = data.tasks?.length ?? 0;
      const eventCount = data.eventsCreated ?? 0;
      const parts = [];
      if (taskCount > 0) parts.push(`${taskCount} task${taskCount !== 1 ? "s" : ""}`);
      if (eventCount > 0) parts.push(`${eventCount} calendar event${eventCount !== 1 ? "s" : ""}`);
      toast.success(parts.length > 0 ? `Created ${parts.join(" and ")}!` : "Voice dump parsed!");

      router.push("/tasks");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setStage("reviewing"); // Fall back to review so user can edit/retry
    }
  }

  async function handleParse() {
    await parseTranscript(transcript, mediaUrl);
  }

  function handleReRecord() {
    reset();
    setTranscript("");
    setMediaUrl(null);
    setError(null);
    setStage("ready");
    transcribeTriggered.current = false;
  }

  // Not supported
  if (!isSupported) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <Mic className="h-10 w-10 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">
          Voice recording isn&apos;t supported in this browser. Try Chrome,
          Firefox, or Safari.
        </p>
      </div>
    );
  }

  // READY state
  if (stage === "ready" && recorderStatus !== "recording") {
    return (
      <div className="flex flex-col items-center gap-6 py-8">
        <button
          onClick={startRecording}
          className={cn(
            "relative flex h-24 w-24 items-center justify-center rounded-full",
            "bg-primary text-primary-foreground",
            "transition-all hover:scale-105 active:scale-95",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          )}
        >
          <Mic className="h-10 w-10" />
        </button>
        <p className="text-sm text-muted-foreground">
          Tap to start recording (up to 5 minutes)
        </p>

        {(error || recorderError) && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            {error || recorderError}
          </div>
        )}
      </div>
    );
  }

  // RECORDING or PAUSED state
  if (recorderStatus === "recording" || recorderStatus === "paused") {
    const isPaused = recorderStatus === "paused";
    const remaining = 5 * 60 - durationSeconds;

    return (
      <div className="flex flex-col items-center gap-6 py-8">
        {/* Animated recording indicator */}
        <div className="relative flex h-24 w-24 items-center justify-center">
          {!isPaused && (
            <>
              <div className="absolute inset-0 animate-ping rounded-full bg-destructive/20" />
              <div className="absolute inset-2 animate-pulse rounded-full bg-destructive/10" />
            </>
          )}
          <button
            onClick={stopRecording}
            className={cn(
              "relative z-10 flex h-24 w-24 items-center justify-center rounded-full",
              "bg-destructive text-destructive-foreground",
              "transition-all hover:scale-105 active:scale-95",
              isPaused && "opacity-80"
            )}
            aria-label="Stop recording"
          >
            <Square className="h-8 w-8" />
          </button>
        </div>

        {/* Timer */}
        <div className="text-center">
          <p className="font-mono text-2xl font-semibold tabular-nums">
            {formatDuration(durationSeconds)}
          </p>
          <p className="text-sm text-muted-foreground">
            {isPaused ? "Paused" : "Recording..."}
          </p>
        </div>

        {/* Pause/Resume button */}
        <Button
          variant="outline"
          size="sm"
          onClick={isPaused ? resumeRecording : pauseRecording}
          className="gap-2"
        >
          {isPaused ? (
            <>
              <Play className="h-4 w-4" />
              Resume
            </>
          ) : (
            <>
              <Pause className="h-4 w-4" />
              Pause
            </>
          )}
        </Button>

        {/* Waveform bars — frozen when paused */}
        <div className="flex h-8 items-end gap-1">
          {Array.from({ length: 20 }).map((_, i) => (
            <div
              key={i}
              className={cn("w-1 rounded-full bg-primary", !isPaused && "waveform-bar")}
              style={{
                animationDelay: !isPaused ? `${i * 0.05}s` : undefined,
                height: isPaused ? "30%" : undefined,
              }}
            />
          ))}
        </div>

        <p className="text-xs text-muted-foreground">
          {remaining > 0
            ? `${formatDuration(remaining)} remaining`
            : "Max reached, stopping..."}
        </p>
      </div>
    );
  }

  // TRANSCRIBING state
  if (stage === "transcribing") {
    return (
      <div className="flex flex-col items-center gap-4 py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <div className="text-center">
          <p className="font-medium">Transcribing your voice...</p>
          <p className="text-sm text-muted-foreground">
            Converting speech to text
          </p>
        </div>
      </div>
    );
  }

  // REVIEWING state
  if (stage === "reviewing") {
    return (
      <div className="space-y-4">
        <Textarea
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          placeholder="Transcript will appear here..."
          className="min-h-[200px] resize-none border-border bg-card text-base leading-relaxed focus-visible:ring-1"
        />

        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Logo className="h-3 w-3" />
            <span>
              {category === "junk_journal"
                ? "Edit if needed, then save as a journal entry"
                : "Edit if needed, then parse into tasks"}
            </span>
          </div>

          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            <Button variant="outline" onClick={handleReRecord} className="w-full sm:w-auto">
              <RotateCcw className="mr-2 h-4 w-4" />
              Re-record
            </Button>
            <Button
              onClick={handleParse}
              disabled={!transcript.trim()}
              size="lg"
              className="w-full sm:w-auto"
            >
              <Send className="mr-2 h-4 w-4" />
              {category === "junk_journal" ? "Save It" : "Parse It"}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // PARSING state
  if (stage === "parsing") {
    return (
      <div className="space-y-4">
        <div className="relative">
          <Textarea
            value={transcript}
            className="min-h-[200px] resize-none border-border bg-card text-base leading-relaxed opacity-50"
            disabled
          />
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-lg bg-card/90 backdrop-blur-sm">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <div className="text-center">
              <p className="font-medium">
                {category === "junk_journal"
                  ? "Saving your journal entry..."
                  : "Parsing your brain dump..."}
              </p>
              <p className="text-sm text-muted-foreground">
                {category === "junk_journal"
                  ? "Writing it down and pulling a short summary"
                  : "Turning chaos into tasks"}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
