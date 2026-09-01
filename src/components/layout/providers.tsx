"use client";

import { useEffect } from "react";
import { ThemeProvider, useTheme } from "next-themes";
import { ClerkProvider } from "@clerk/nextjs";
import { dark } from "@clerk/themes";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { UpdateAvailableToast } from "./update-available-toast";

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
        variables: {
          // Reference the app's own CSS custom properties (globals.css) so
          // Clerk's embedded UI (sign-in/sign-up, user profile) stays in sync
          // with ControlledChaos's own sunset palette and flips with .dark
          // the same way the rest of the app does.
          colorPrimary: "var(--adhd-purple)",
          colorPrimaryForeground: "var(--primary-foreground)",
          colorBackground: "var(--card)",
          colorForeground: "var(--foreground)",
          colorMuted: "var(--muted)",
          colorMutedForeground: "var(--muted-foreground)",
          colorInput: "var(--input)",
          colorInputForeground: "var(--foreground)",
          colorBorder: "var(--border)",
          colorRing: "var(--ring)",
          colorDanger: "var(--destructive)",
          colorSuccess: "var(--success)",
          colorWarning: "var(--warning)",
          colorNeutral: "var(--adhd-lavender)",
          fontFamily: "var(--font-plex-sans)",
          fontFamilyButtons: "var(--font-plex-sans)",
          borderRadius: "var(--radius)",
        },
      }}
    >
      {children}
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
            <UpdateAvailableToast />
          </TooltipProvider>
        </ClerkProviderWithTheme>
      ) : (
        <TooltipProvider>
          {children}
          <Toaster />
          <UpdateAvailableToast />
        </TooltipProvider>
      )}
    </ThemeProvider>
  );
}
