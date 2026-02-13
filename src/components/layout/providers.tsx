"use client";

import { ClerkProvider } from "@clerk/nextjs";
import { dark } from "@clerk/themes";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "sonner";

export function Providers({ children }: { children: React.ReactNode }) {
  const clerkKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

  if (!clerkKey) {
    // Dev mode without Clerk keys — render without auth
    return (
      <TooltipProvider>
        {children}
        <Toaster theme="dark" position="bottom-right" />
      </TooltipProvider>
    );
  }

  return (
    <ClerkProvider
      publishableKey={clerkKey}
      appearance={{ baseTheme: dark }}
    >
      <TooltipProvider>
        {children}
        <Toaster theme="dark" position="bottom-right" />
      </TooltipProvider>
    </ClerkProvider>
  );
}
