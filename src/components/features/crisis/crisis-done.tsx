import Link from "next/link";
import { Button } from "@/components/ui/button";

interface Props {
  taskName: string;
}

export function CrisisDone({ taskName }: Props) {
  return (
    <div className="flex flex-col items-center gap-6 py-12 text-center">
      <h1 className="text-5xl font-bold tracking-tight">Done.</h1>
      <p className="text-lg text-muted-foreground">{taskName}</p>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button asChild>
          <Link href="/dashboard">Back to dashboard</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/dump">Brain dump anything leftover</Link>
        </Button>
      </div>
    </div>
  );
}
