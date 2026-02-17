"use client";

import { useState } from "react";
import { Type, Mic, Camera } from "lucide-react";
import { cn } from "@/lib/utils";
import { DumpInput } from "@/components/features/brain-dump/dump-input";
import { VoiceRecorder } from "@/components/features/brain-dump/voice-recorder";
import { PhotoUploader } from "@/components/features/brain-dump/photo-uploader";
import { DumpHistory } from "@/components/features/brain-dump/dump-history";

type InputMode = "text" | "voice" | "photo";

export default function BrainDumpPage() {
  const [mode, setMode] = useState<InputMode>("text");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Brain Dump</h1>
        <p className="text-muted-foreground">
          Just start{" "}
          {mode === "text"
            ? "typing"
            : mode === "voice"
              ? "talking"
              : "snapping"}
          . Messy is fine.
          I&apos;ll sort it out.
        </p>
      </div>

      {/* Mode toggle */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setMode("text")}
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

      {mode === "text" ? (
        <DumpInput />
      ) : mode === "voice" ? (
        <VoiceRecorder />
      ) : (
        <PhotoUploader />
      )}

      <DumpHistory />
    </div>
  );
}
