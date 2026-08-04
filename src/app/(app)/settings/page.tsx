import { Suspense } from "react";
import { SettingsTabs } from "@/components/features/settings/settings-tabs";
import { PageHeader } from "@/components/ui/page-header";

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Preferences, integrations, and locations."
      />

      <Suspense>
        <SettingsTabs />
      </Suspense>
    </div>
  );
}
