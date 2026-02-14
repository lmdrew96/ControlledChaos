import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function RecommendationSkeleton() {
  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardContent className="space-y-4 p-6">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-6 w-3/4" />
        <Skeleton className="h-4 w-full" />
        <div className="flex gap-2">
          <Skeleton className="h-5 w-16 rounded-full" />
          <Skeleton className="h-5 w-12 rounded-full" />
          <Skeleton className="h-5 w-20 rounded-full" />
        </div>
        <div className="flex gap-2 pt-2">
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-9 w-24" />
        </div>
      </CardContent>
    </Card>
  );
}
