"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Quiet "couldn't load" strip with a Retry button. Use it wherever a failed
 * fetch would otherwise fall through to an empty state — an error must never
 * read as "you have nothing here".
 */
export function LoadErrorStrip({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => Promise<unknown>;
}): React.ReactElement {
  const [retrying, setRetrying] = useState(false);

  const handleRetry = async () => {
    setRetrying(true);
    try {
      await onRetry();
    } finally {
      setRetrying(false);
    }
  };

  return (
    <div
      role="alert"
      className="flex items-center justify-between rounded-xl border border-border/40 bg-card/50 px-4 py-3 text-sm"
    >
      <span className="text-muted-foreground">{message}</span>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => void handleRetry()}
        disabled={retrying}
      >
        <RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", retrying && "animate-spin")} />
        {retrying ? "Retrying…" : "Retry"}
      </Button>
    </div>
  );
}
