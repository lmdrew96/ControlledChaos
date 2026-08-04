import { MicrotasksManager } from "@/components/features/microtasks/microtasks-manager";
import { PageHeader } from "@/components/ui/page-header";

export default function MicrotasksPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Microtasks"
        description="Small daily prompts. Don't accumulate when missed. No streaks, no shame."
      />
      <MicrotasksManager />
    </div>
  );
}
