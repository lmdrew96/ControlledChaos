import { MicrotasksManager } from "@/components/features/microtasks/microtasks-manager";

export default function MicrotasksPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Microtasks</h1>
        <p className="text-muted-foreground">
          Small daily prompts. Don&apos;t accumulate when missed. No streaks, no shame.
        </p>
      </div>
      <MicrotasksManager />
    </div>
  );
}
