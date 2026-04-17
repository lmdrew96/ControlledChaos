"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ImagePlus,
  Loader2,
  Send,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  compressImage,
  IMAGE_ALLOWED_TYPES,
  IMAGE_MAX_FILE_SIZE,
} from "@/lib/storage/compress";

const MAX_CONTENT_LENGTH = 10_000;
const MAX_ATTACHMENTS = 10;

interface Attachment {
  id: string;
  /** Object URL used for preview until the server URL is resolved. */
  previewUrl: string;
  /** Populated once upload completes. */
  remoteUrl: string | null;
  /** Upload in flight. */
  uploading: boolean;
  /** Per-attachment error, if any. */
  error: string | null;
}

/**
 * Unified compose surface for Junk Journal: one textarea + N image
 * attachments, all posted as a single brain_dumps row via /api/dump/journal.
 * Text is optional — image-only entries are valid (no summary call).
 */
export function JournalCompose() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [content, setContent] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const anyUploading = attachments.some((a) => a.uploading);
  const readyAttachments = attachments.filter(
    (a) => !a.uploading && a.remoteUrl
  );
  const charCount = content.length;
  const isOverLimit = charCount > MAX_CONTENT_LENGTH;

  const canSubmit =
    !isSubmitting &&
    !anyUploading &&
    !isOverLimit &&
    (content.trim().length > 0 || readyAttachments.length > 0);

  async function addFiles(files: FileList | File[]) {
    const arr = Array.from(files);
    const remainingSlots = MAX_ATTACHMENTS - attachments.length;
    if (remainingSlots <= 0) {
      toast.error(`Max ${MAX_ATTACHMENTS} attachments per entry`);
      return;
    }
    const filesToUpload = arr.slice(0, remainingSlots);
    if (arr.length > remainingSlots) {
      toast.error(
        `Only added the first ${remainingSlots} — max ${MAX_ATTACHMENTS} per entry`
      );
    }

    for (const file of filesToUpload) {
      await enqueueUpload(file);
    }
  }

  async function enqueueUpload(file: File) {
    if (!IMAGE_ALLOWED_TYPES.has(file.type)) {
      toast.error(
        `${file.name}: unsupported format. Use JPEG, PNG, GIF, or WebP.`
      );
      return;
    }
    if (file.size > IMAGE_MAX_FILE_SIZE) {
      toast.error(`${file.name}: too large (max 10MB).`);
      return;
    }

    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    let processed = file;
    try {
      processed = await compressImage(file);
    } catch {
      // Fall back to original if compression fails
    }

    const previewUrl = URL.createObjectURL(processed);
    const entry: Attachment = {
      id,
      previewUrl,
      remoteUrl: null,
      uploading: true,
      error: null,
    };
    setAttachments((prev) => [...prev, entry]);

    try {
      const formData = new FormData();
      formData.append("photo", processed);
      const res = await fetch("/api/dump/upload-image", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Upload failed");
      }
      const data = (await res.json()) as { mediaUrl: string };
      setAttachments((prev) =>
        prev.map((a) =>
          a.id === id
            ? { ...a, remoteUrl: data.mediaUrl, uploading: false }
            : a
        )
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      setAttachments((prev) =>
        prev.map((a) =>
          a.id === id ? { ...a, uploading: false, error: msg } : a
        )
      );
      toast.error(msg);
    }
  }

  function removeAttachment(id: string) {
    setAttachments((prev) => {
      const target = prev.find((a) => a.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((a) => a.id !== id);
    });
  }

  async function handleSubmit() {
    if (!canSubmit) return;
    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/dump/journal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: content.trim(),
          mediaUrls: readyAttachments
            .map((a) => a.remoteUrl)
            .filter((u): u is string => !!u),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Failed to save journal entry");
      }
      toast.success("Journal entry saved");
      // Clean up object URLs
      for (const a of attachments) URL.revokeObjectURL(a.previewUrl);
      setContent("");
      setAttachments([]);
      router.push("/journal");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <Textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="A paragraph, a half-formed thought, a quote — whatever's worth keeping. Text is optional; you can also just attach an image."
        className="min-h-[220px] resize-none border-border bg-card text-base leading-relaxed placeholder:text-muted-foreground/50 focus-visible:ring-1"
        disabled={isSubmitting}
        maxLength={MAX_CONTENT_LENGTH + 500 /* soft cap, enforced client-side below */}
      />

      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {attachments.map((a) => (
            <AttachmentThumb
              key={a.id}
              attachment={a}
              onRemove={() => removeAttachment(a.id)}
            />
          ))}
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                addFiles(e.target.files);
                e.target.value = "";
              }
            }}
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={
              isSubmitting || attachments.length >= MAX_ATTACHMENTS
            }
          >
            <ImagePlus className="mr-2 h-4 w-4" />
            Add photo
          </Button>
          {charCount > 0 && (
            <span
              className={`text-xs ${isOverLimit ? "text-destructive" : "text-muted-foreground"}`}
            >
              {charCount.toLocaleString()} / {MAX_CONTENT_LENGTH.toLocaleString()}
            </span>
          )}
        </div>

        <Button
          size="lg"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="w-full sm:w-auto"
        >
          {isSubmitting ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Send className="mr-2 h-4 w-4" />
          )}
          Save entry
        </Button>
      </div>

      <p className="text-xs text-muted-foreground/60">
        Saved as-is — no task extraction. A short summary is generated for
        text entries.
      </p>
    </div>
  );
}

interface AttachmentThumbProps {
  attachment: Attachment;
  onRemove: () => void;
}

function AttachmentThumb({ attachment, onRemove }: AttachmentThumbProps) {
  return (
    <div className="group relative h-20 w-20 shrink-0 overflow-hidden rounded-md border border-border bg-muted">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={attachment.previewUrl}
        alt="Attachment preview"
        className="h-full w-full object-cover"
      />
      {attachment.uploading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40">
          <Loader2 className="h-5 w-5 animate-spin text-white" />
        </div>
      )}
      {attachment.error && !attachment.uploading && (
        <div className="absolute inset-0 flex items-center justify-center bg-destructive/60">
          <AlertCircle className="h-5 w-5 text-destructive-foreground" />
        </div>
      )}
      <button
        type="button"
        onClick={onRemove}
        className="absolute top-0.5 right-0.5 rounded-full bg-black/60 p-0.5 text-white opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
        aria-label="Remove attachment"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
