import { cn } from "@/lib/utils";

interface WashiTapeProps {
  className?: string;
  rotate?: number;
}

// Marks "this is pinned / active right now" on an emphasis card. Positioned
// as a sibling of the card it decorates, never a child — a torn-card's
// clip-path would otherwise clip the tape's overhang.
export function WashiTape({ className, rotate = -7 }: WashiTapeProps) {
  return (
    <span
      aria-hidden="true"
      className={cn("pointer-events-none absolute h-6 w-16 shadow-sm", className)}
      style={{
        background:
          "repeating-linear-gradient(45deg, var(--adhd-green) 0 6px, color-mix(in srgb, var(--adhd-amber) 55%, var(--adhd-green)) 6px 12px)",
        opacity: 0.85,
        transform: `rotate(${rotate}deg)`,
      }}
    />
  );
}
