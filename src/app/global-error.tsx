"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[Global Error]", error);
  }, [error]);

  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#0a0a0a] text-[#fafafa]">
        <h2 className="text-lg font-semibold">Something went wrong</h2>
        <p className="text-sm text-[#a1a1aa]">
          Your data is safe. Refresh to try again.
        </p>
        <button
          onClick={reset}
          className="rounded-md border border-[#27272a] px-4 py-2 text-sm hover:bg-[#27272a] transition-colors"
        >
          Try Again
        </button>
      </body>
    </html>
  );
}
