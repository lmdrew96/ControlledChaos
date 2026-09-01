"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

export function OnboardingGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    // Skip the check on the onboarding page itself — the render below already
    // lets that route through regardless of `checked`.
    if (pathname === "/onboarding") return;

    let cancelled = false;

    async function checkOnboarding() {
      try {
        const res = await fetch("/api/onboarding/status");
        if (cancelled) return;

        if (res.ok) {
          const data = await res.json();
          if (!data.onboardingComplete) {
            router.replace("/onboarding");
            return;
          }
        }
        setChecked(true);
      } catch {
        // If check fails, don't block — let them through
        if (!cancelled) setChecked(true);
      }
    }

    void checkOnboarding();

    return () => {
      cancelled = true;
    };
  }, [pathname, router]);

  if (!checked && pathname !== "/onboarding") {
    return null;
  }

  return <>{children}</>;
}
