import Link from "next/link";
import { Brain, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TaskList } from "@/components/features/task-feed/task-list";
import { DoThisNext } from "@/components/features/recommendation/do-this-next";
import { DailyMomentum } from "@/components/features/dashboard/daily-momentum";
import { TimeAnchor } from "@/components/features/dashboard/time-anchor";

export default function DashboardPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Your brain has the ideas. I&apos;ll handle the rest.
        </p>
      </div>

      {/* Time anchor — ambient time awareness */}
      <TimeAnchor />

      {/* Hero: Task Recommendation */}
      <DoThisNext />

      {/* Daily momentum */}
      <DailyMomentum />

      {/* Quick brain dump CTA */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4 sm:items-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <Brain className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h2 className="font-semibold">Got something on your mind?</h2>
              <p className="text-sm text-muted-foreground">
                Dump it. I&apos;ll turn it into tasks.
              </p>
            </div>
          </div>
          <Button asChild className="w-full sm:w-auto">
            <Link href="/dump">
              Brain Dump
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </CardContent>
      </Card>

      {/* Task feed */}
      <div className="space-y-4">
        <CardHeader className="px-0">
          <CardTitle className="text-lg">Your Tasks</CardTitle>
        </CardHeader>
        <TaskList />
      </div>
    </div>
  );
}
