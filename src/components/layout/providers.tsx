"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { ThemeProvider, useTheme } from "next-themes";
import { ClerkProvider, useAuth } from "@clerk/nextjs";
import { dark } from "@clerk/themes";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { getConvexClient } from "@/lib/parallel-play/convex-client";
import { ParallelPlayProvider } from "@/lib/parallel-play/context";

function ConvexAndPPProviders({ children }: { children: React.ReactNode }) {
  const client = useMemo(() => getConvexClient(), []);
  if (!client) {
    // No Convex configured — degrade gracefully. Parallel-play hooks will
    // return inert defaults (see useParallelPlay).
    return <>{children}</>;
  }
  return (
    <ConvexProviderWithClerk client={client} useAuth={useAuth}>
      <ParallelPlayProvider>{children}</ParallelPlayProvider>
    </ConvexProviderWithClerk>
  );
}

function ClerkProviderWithTheme({
  publishableKey,
  children,
}: {
  publishableKey: string;
  children: React.ReactNode;
}) {
  const { resolvedTheme } = useTheme();
  return (
    <ClerkProvider
      publishableKey={publishableKey}
      appearance={{
        baseTheme: resolvedTheme === "dark" ? dark : undefined,
      }}
    >
      <ConvexAndPPProviders>{children}</ConvexAndPPProviders>
    </ClerkProvider>
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  const clerkKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const router = useRouter();

  // Apply visual density preference on mount
  useEffect(() => {
    const density = localStorage.getItem("cc-density");
    if (density === "compact") {
      document.documentElement.classList.add("density-compact");
    }
  }, []);

  // If the service worker opened the app via the launch query, finish the
  // navigation from inside the SPA so we don't deep-link the worker into a
  // browser context on iOS.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const launch = params.get("launch");
    if (!launch || !launch.startsWith("/")) return;
    router.replace(launch);
  }, [router]);

  // Route service-worker notification clicks through the SPA router so iOS
  // stays in the installed app instead of opening a fresh browser context.
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const handleMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; url?: string } | undefined;
      if (data?.type !== "cc:navigate" || typeof data.url !== "string") return;
      router.push(data.url);
    };

    navigator.serviceWorker.addEventListener("message", handleMessage);
    return () => {
      navigator.serviceWorker.removeEventListener("message", handleMessage);
    };
  }, [router]);

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem
      disableTransitionOnChange
    >
      {clerkKey ? (
        <ClerkProviderWithTheme publishableKey={clerkKey}>
          <TooltipProvider>
            {children}
            <Toaster />
          </TooltipProvider>
        </ClerkProviderWithTheme>
      ) : (
        <TooltipProvider>
          {children}
          <Toaster />
        </TooltipProvider>
      )}
    </ThemeProvider>
  );
}
