import Link from "next/link";
import { Brain, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TaskList } from "@/components/features/task-feed/task-list";
import { DoThisNext } from "@/components/features/recommendation/do-this-next";
import { DailyMomentum } from "@/components/features/dashboard/daily-momentum";
import { ScheduleMyDay } from "@/components/features/dashboard/schedule-my-day";
import { TimeAnchor } from "@/components/features/dashboard/time-anchor";
import { Greeting } from "@/components/features/dashboard/greeting";

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      {/* Greeting + Time anchor row */}
      <div className="space-y-3">
        <Greeting />
        <TimeAnchor />
      </div>

      {/* Hero: Task Recommendation */}
      <DoThisNext />

      {/* Action row: Momentum + Schedule My Day + Brain dump */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <DailyMomentum />

        {/* Schedule My Day */}
        <ScheduleMyDay />

        {/* Quick brain dump CTA */}
        <Card className="group relative overflow-hidden border-border/40 bg-card/80 transition-colors hover:border-primary/30">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.04] to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
          <CardContent className="relative flex h-full flex-col justify-between gap-4 p-5">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                <Brain className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h2 className="font-semibold leading-snug">Got something on your mind?</h2>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Dump it. I&apos;ll turn it into tasks.
                </p>
              </div>
            </div>
            <Button asChild size="sm" className="w-full">
              <Link href="/dump">
                Brain Dump
                <ArrowRight className="ml-2 h-3.5 w-3.5" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Task feed */}
      <div className="space-y-4">
        <CardHeader className="px-0 pb-2">
          <CardTitle className="text-base font-semibold tracking-tight">Your Tasks</CardTitle>
        </CardHeader>
        <TaskList />
      </div>
    </div>
  );
}
