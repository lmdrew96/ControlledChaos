"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function DumpInput() {
  const [content, setContent] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const router = useRouter();

  // Auto-focus on mount
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  async function handleSubmit() {
    if (!content.trim() || isLoading) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/dump/text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to process brain dump");
      }

      setContent("");
      router.push("/tasks");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Cmd/Ctrl + Enter to submit
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    }
  }

  const charCount = content.length;
  const isOverLimit = charCount > 10000;

  return (
    <div className="space-y-4">
      <div className="relative">
        <Textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="just start typing... assignments due friday, need to email professor, pick up groceries, that thing I keep forgetting about, call mom back..."
          className="min-h-[300px] resize-none border-border bg-card text-base leading-relaxed placeholder:text-muted-foreground/50 focus-visible:ring-1"
          disabled={isLoading}
        />

        {isLoading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-lg bg-card/90 backdrop-blur-sm">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <div className="text-center">
              <p className="font-medium">Parsing your brain dump...</p>
              <p className="text-sm text-muted-foreground">
                Turning chaos into tasks and events
              </p>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Sparkles className="h-3 w-3" />
          <span>AI will parse your thoughts into tasks and calendar events</span>
        </div>

        <div className="flex items-center gap-3">
          {charCount > 0 && (
            <span
              className={`text-xs ${isOverLimit ? "text-destructive" : "text-muted-foreground"}`}
            >
              {charCount.toLocaleString()} / 10,000
            </span>
          )}

          <Button
            onClick={handleSubmit}
            disabled={!content.trim() || isLoading || isOverLimit}
            size="lg"
          >
            {isLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-2 h-4 w-4" />
            )}
            Dump It
          </Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground/60">
        Tip: Press <kbd className="rounded border border-border px-1 py-0.5 text-[10px]">Cmd</kbd> + <kbd className="rounded border border-border px-1 py-0.5 text-[10px]">Enter</kbd> to submit
      </p>
    </div>
  );
}
