"use client";

import { useState, useRef } from "react";
import { Paperclip, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { CrisisFileAttachment } from "@/types";

const COMPLETION_OPTIONS = [
  { label: "0%", value: 0 },
  { label: "~25%", value: 25 },
  { label: "~50%", value: 50 },
  { label: "~75%", value: 75 },
];

const ALLOWED_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "application/pdf",
]);

interface CrisisIntakeData {
  taskName: string;
  deadline: string;
  completionPct: number;
  files: CrisisFileAttachment[];
}

interface Props {
  onSubmit: (data: CrisisIntakeData) => void;
}

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve((reader.result as string).split(",")[1] ?? "");
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function CrisisIntakeForm({ onSubmit }: Props) {
  const [taskName, setTaskName] = useState("");
  const [deadline, setDeadline] = useState("");
  const [completionPct, setCompletionPct] = useState(0);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function addFiles(newFiles: FileList | null) {
    if (!newFiles) return;
    const valid = Array.from(newFiles).filter((f) => ALLOWED_TYPES.has(f.type));
    setAttachments((prev) => {
      const combined = [...prev, ...valid];
      return combined.slice(0, 2); // max 2
    });
  }

  function removeAttachment(index: number) {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    addFiles(e.dataTransfer.files);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!taskName.trim() || !deadline) return;

    setIsSubmitting(true);
    try {
      const files: CrisisFileAttachment[] = await Promise.all(
        attachments.map(async (file) => ({
          base64: await readAsBase64(file),
          mediaType: file.type as CrisisFileAttachment["mediaType"],
          name: file.name,
        }))
      );

      // datetime-local gives "YYYY-MM-DDTHH:mm" (no tz, no seconds).
      // Convert to full ISO in the browser where this parsing is reliable.
      const deadlineISO = new Date(deadline).toISOString();
      onSubmit({ taskName: taskName.trim(), deadline: deadlineISO, completionPct, files });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="taskName">What are you behind on?</Label>
        <Input
          id="taskName"
          value={taskName}
          onChange={(e) => setTaskName(e.target.value)}
          placeholder="e.g. ENGL 210 reflection paper"
          required
          autoFocus
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="deadline">When is it due?</Label>
        <Input
          id="deadline"
          type="datetime-local"
          value={deadline}
          onChange={(e) => setDeadline(e.target.value)}
          required
        />
      </div>

      <div className="space-y-2">
        <Label>How much is done?</Label>
        <div className="flex gap-2">
          {COMPLETION_OPTIONS.map((opt) => (
            <Button
              key={opt.value}
              type="button"
              variant={completionPct === opt.value ? "default" : "outline"}
              className="flex-1"
              onClick={() => setCompletionPct(opt.value)}
            >
              {opt.label}
            </Button>
          ))}
        </div>
      </div>

      {/* File attachment */}
      <div className="space-y-2">
        <Label>Got assignment details? Drop them here.</Label>
        <p className="text-xs text-muted-foreground">
          Screenshots, PDFs, or docs — optional
        </p>

        {attachments.length < 2 && (
          <label
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={cn(
              "flex cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed px-4 py-3 transition-colors",
              isDragging
                ? "border-primary bg-primary/5"
                : "border-border hover:border-primary/50 hover:bg-accent/50"
            )}
          >
            <Paperclip className="h-5 w-5 shrink-0 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">Attach files</p>
              <p className="text-xs text-muted-foreground">
                Images or PDF · max 2
              </p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/png,image/jpeg,image/webp,image/gif,application/pdf"
              onChange={(e) => addFiles(e.target.files)}
              className="hidden"
            />
          </label>
        )}

        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {attachments.map((file, i) => (
              <span
                key={`${file.name}-${i}`}
                className="flex items-center gap-1.5 rounded-full border border-border bg-accent/50 px-3 py-1 text-xs"
              >
                <Paperclip className="h-3 w-3 text-muted-foreground" />
                <span className="max-w-[140px] truncate">{file.name}</span>
                <button
                  type="button"
                  onClick={() => removeAttachment(i)}
                  className="ml-0.5 text-muted-foreground hover:text-foreground"
                  aria-label={`Remove ${file.name}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      <Button
        type="submit"
        size="lg"
        className="w-full"
        disabled={!taskName.trim() || !deadline || isSubmitting}
      >
        Assess the situation
      </Button>
    </form>
  );
}
