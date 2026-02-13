import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Your brain has the ideas. I&apos;ll handle the rest.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Do This Next</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            No tasks yet. Start with a brain dump to get going.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
