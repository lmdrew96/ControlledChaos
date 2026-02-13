"use client";

import { ClerkProvider } from "@clerk/nextjs";
import { dark } from "@clerk/themes";
import { TooltipProvider } from "@/components/ui/tooltip";

export function Providers({ children }: { children: React.ReactNode }) {
  const clerkKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

  if (!clerkKey) {
    // Dev mode without Clerk keys — render without auth
    return <TooltipProvider>{children}</TooltipProvider>;
  }

  return (
    <ClerkProvider
      publishableKey={clerkKey}
      appearance={{ baseTheme: dark }}
    >
      <TooltipProvider>{children}</TooltipProvider>
    </ClerkProvider>
  );
}
