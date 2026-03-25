import Link from "next/link";
import { cn } from "@/lib/utils";

export function LegalFooter({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-4 text-xs text-muted-foreground", className)}>
      <Link href="/terms" className="hover:text-foreground transition-colors">
        Terms
      </Link>
      <Link href="/privacy" className="hover:text-foreground transition-colors">
        Privacy
      </Link>
    </div>
  );
}
