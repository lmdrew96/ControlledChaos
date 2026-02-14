import Link from "next/link";
import { Brain, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export function RecommendationEmptyState({
  message,
}: {
  message?: string;
}) {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center gap-3 p-6 text-center">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
          <Brain className="h-5 w-5 text-muted-foreground" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-medium">
            {message ?? "No pending tasks"}
          </p>
          <p className="text-sm text-muted-foreground">
            Do a brain dump and I&apos;ll find your next move.
          </p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href="/dump">
            Brain Dump
            <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
