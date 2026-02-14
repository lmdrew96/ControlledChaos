"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Camera, ImagePlus, Loader2, RotateCcw, Send, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type PhotoStage = "ready" | "uploading" | "parsing" | "reviewing";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);

export function PhotoUploader() {
  const router = useRouter();
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const [stage, setStage] = useState<PhotoStage>("ready");
  const [preview, setPreview] = useState<string | null>(null);
  const [extractedText, setExtractedText] = useState("");
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  function validateFile(file: File): string | null {
    if (!ALLOWED_TYPES.has(file.type)) {
      return "Unsupported format. Use JPEG, PNG, GIF, or WebP.";
    }
    if (file.size > MAX_FILE_SIZE) {
      return "Photo too large (max 10MB).";
    }
    return null;
  }

  async function handleFile(file: File) {
    const validationError = validateFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }

    setError(null);

    // Create preview
    const reader = new FileReader();
    reader.onload = (e) => setPreview(e.target?.result as string);
    reader.readAsDataURL(file);

    // Upload and extract
    await uploadAndExtract(file);
  }

  async function uploadAndExtract(file: File) {
    setStage("uploading");
    setError(null);

    try {
      const formData = new FormData();
      formData.append("photo", file);

      const response = await fetch("/api/dump/photo/extract", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Photo processing failed");
      }

      const data = await response.json();
      setExtractedText(data.extractedText);
      setMediaUrl(data.mediaUrl);

      // Auto-parse immediately
      await parseExtractedText(data.extractedText, data.mediaUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Photo processing failed");
      setStage("ready");
    }
  }

  async function parseExtractedText(text: string, url: string | null) {
    if (!text.trim()) return;

    setStage("parsing");
    setError(null);

    try {
      const response = await fetch("/api/dump/photo/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ extractedText: text, mediaUrl: url }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to parse brain dump");
      }

      toast.success("Photo dump parsed into tasks!");
      router.push("/tasks");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setStage("reviewing");
    }
  }

  function handleParse() {
    parseExtractedText(extractedText, mediaUrl);
  }

  function handleReset() {
    setStage("ready");
    setPreview(null);
    setExtractedText("");
    setMediaUrl(null);
    setError(null);
    if (cameraInputRef.current) cameraInputRef.current.value = "";
    if (galleryInputRef.current) galleryInputRef.current.value = "";
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
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
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  // READY state
  if (stage === "ready") {
    return (
      <div className="flex flex-col items-center gap-6 py-8">
        <div className="flex w-full max-w-sm flex-col gap-3">
          {/* Take photo — shows camera on mobile, file picker on desktop */}
          <label className="flex cursor-pointer items-center gap-4 rounded-xl border-2 border-dashed border-border px-5 py-4 transition-colors hover:border-primary/50 hover:bg-accent/50">
            <Camera className="h-8 w-8 shrink-0 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">Take a photo</p>
              <p className="text-xs text-muted-foreground">
                Use your camera to capture notes
              </p>
            </div>
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              capture="environment"
              onChange={handleInputChange}
              className="hidden"
            />
          </label>

          {/* Upload from gallery/files — no capture attribute */}
          <label
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={cn(
              "flex cursor-pointer items-center gap-4 rounded-xl border-2 border-dashed px-5 py-4 transition-colors",
              isDragging
                ? "border-primary bg-primary/5"
                : "border-border hover:border-primary/50 hover:bg-accent/50"
            )}
          >
            <ImagePlus className="h-8 w-8 shrink-0 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">Upload an image</p>
              <p className="text-xs text-muted-foreground">
                From gallery, files, or drag and drop
              </p>
            </div>
            <input
              ref={galleryInputRef}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              onChange={handleInputChange}
              className="hidden"
            />
          </label>
        </div>

        {error && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}
      </div>
    );
  }

  // UPLOADING state
  if (stage === "uploading") {
    return (
      <div className="space-y-4">
        <div className="relative overflow-hidden rounded-lg">
          {preview && (
            <img
              src={preview}
              alt="Uploaded photo"
              className="max-h-64 w-full object-contain opacity-50"
            />
          )}
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-lg bg-card/90 backdrop-blur-sm">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <div className="text-center">
              <p className="font-medium">Reading your photo...</p>
              <p className="text-sm text-muted-foreground">
                Extracting text from image
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // PARSING state
  if (stage === "parsing") {
    return (
      <div className="space-y-4">
        <div className="relative overflow-hidden rounded-lg">
          {preview && (
            <img
              src={preview}
              alt="Uploaded photo"
              className="max-h-64 w-full object-contain opacity-50"
            />
          )}
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-lg bg-card/90 backdrop-blur-sm">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <div className="text-center">
              <p className="font-medium">Parsing your brain dump...</p>
              <p className="text-sm text-muted-foreground">
                Turning chaos into tasks
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // REVIEWING state (fallback)
  if (stage === "reviewing") {
    return (
      <div className="space-y-4">
        {preview && (
          <img
            src={preview}
            alt="Uploaded photo"
            className="max-h-48 w-full rounded-lg object-contain"
          />
        )}

        <Textarea
          value={extractedText}
          onChange={(e) => setExtractedText(e.target.value)}
          placeholder="Extracted text will appear here..."
          className="min-h-[200px] resize-none border-border bg-card text-base leading-relaxed focus-visible:ring-1"
        />

        {error && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Sparkles className="h-3 w-3" />
            <span>Edit if needed, then parse into tasks</span>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={handleReset}>
              <RotateCcw className="mr-2 h-4 w-4" />
              New photo
            </Button>
            <Button
              onClick={handleParse}
              disabled={!extractedText.trim()}
              size="lg"
            >
              <Send className="mr-2 h-4 w-4" />
              Parse It
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
