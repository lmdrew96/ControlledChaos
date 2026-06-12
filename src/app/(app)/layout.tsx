import { AppShell } from "@/components/layout/app-shell";
import { OnboardingGuard } from "@/components/layout/onboarding-guard";
import { PushAutoHeal } from "@/components/layout/push-auto-heal";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <OnboardingGuard>
      <PushAutoHeal />
      <AppShell>{children}</AppShell>
    </OnboardingGuard>
  );
}
