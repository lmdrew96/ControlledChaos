import Link from "next/link";
import { Brain } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6">
      <div className="flex max-w-md flex-col items-center gap-8 text-center">
        <div className="flex items-center gap-3">
          <Brain className="h-10 w-10 text-primary" />
          <h1 className="text-4xl font-bold tracking-tight">
            ControlledChaos
          </h1>
        </div>

        <p className="text-lg text-muted-foreground">
          Your brain has the ideas. I&apos;ll handle the rest.
        </p>

        <p className="text-sm text-muted-foreground">
          AI-powered executive function companion for ADHD minds.
          Dump your thoughts, get structured tasks, know what to do next.
        </p>

        <div className="flex gap-3">
          <Button asChild size="lg">
            <Link href="/sign-up">Get Started</Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="/sign-in">Sign In</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
