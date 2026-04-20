import { Skeleton } from "@/components/ui/skeleton";

export default function MomentumLoading() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-baseline justify-between">
        <Skeleton className="h-8 w-44" />
        <Skeleton className="h-4 w-36" />
      </div>
      {/* Metric cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      {/* Daily bar chart */}
      <Skeleton className="h-48 w-full rounded-xl" />
      {/* Circadian */}
      <Skeleton className="h-64 w-full rounded-xl" />
      {/* Stacked full-width cards */}
      <Skeleton className="h-40 w-full rounded-xl" />
      <Skeleton className="h-44 w-full rounded-xl" />
      <Skeleton className="h-24 w-full rounded-xl" />
      <Skeleton className="h-40 w-full rounded-xl" />
      <Skeleton className="h-36 w-full rounded-xl" />
    </div>
  );
}
