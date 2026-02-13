import { DumpInput } from "@/components/features/brain-dump/dump-input";

export default function BrainDumpPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Brain Dump</h1>
        <p className="text-muted-foreground">
          Just start typing. Messy is fine. I&apos;ll sort it out.
        </p>
      </div>

      <DumpInput />
    </div>
  );
}
