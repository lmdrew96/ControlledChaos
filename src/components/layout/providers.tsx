"use client";

import { useEffect, useMemo } from "react";
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

  // Apply visual density preference on mount
  useEffect(() => {
    const density = localStorage.getItem("cc-density");
    if (density === "compact") {
      document.documentElement.classList.add("density-compact");
    }
  }, []);

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
