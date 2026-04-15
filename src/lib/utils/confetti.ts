import confetti from "canvas-confetti";
import type { CelebrationLevel } from "@/types";

const COLORS = [
  "#ff6b6b", "#ffd93d", "#6bcb77",
  "#4d96ff", "#c77dff", "#ff9f43",
  "#ff4757", "#eccc68", "#2ed573",
  "#1e90ff", "#a29bfe", "#fd79a8",
];

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Read user's celebration level from localStorage (set by settings page). */
function getCelebrationLevel(): CelebrationLevel {
  if (typeof window === "undefined") return "full";
  return (localStorage.getItem("cc-celebration-level") as CelebrationLevel) || "full";
}

/**
 * Full-window confetti DETONATION. ~2,000 particles from every direction —
 * center, all four corners, top shower, AND bottom-up rockets. No escape.
 *
 * Respects:
 * 1. User's in-app celebration level (none / subtle / full)
 * 2. OS prefers-reduced-motion as fallback
 */
export function fireTaskConfetti() {
  const level = getCelebrationLevel();

  // "none" — no confetti at all
  if (level === "none") return;

  // "subtle" or OS reduced-motion — single gentle burst
  if (level === "subtle" || prefersReducedMotion()) {
    confetti({ colors: COLORS, zIndex: 9999, particleCount: 30, spread: 60, startVelocity: 20, origin: { x: 0.5, y: 0.6 } });
    return;
  }

  // "full" — the full detonation
  const fire = (opts: confetti.Options) =>
    confetti({ colors: COLORS, zIndex: 9999, ...opts });

  // Wave 1 (0ms) — massive center explosion
  fire({ particleCount: 250, spread: 130, startVelocity: 60, origin: { x: 0.5, y: 0.6 } });

  // Wave 2 (100ms) — all four corners firing simultaneously
  setTimeout(() => {
    fire({ particleCount: 130, angle: 55,  spread: 75, startVelocity: 65, origin: { x: 0,   y: 1   } }); // bottom-left corner → up-right
    fire({ particleCount: 130, angle: 125, spread: 75, startVelocity: 65, origin: { x: 1,   y: 1   } }); // bottom-right corner → up-left
    fire({ particleCount: 130, angle: 300, spread: 75, startVelocity: 65, origin: { x: 0,   y: 0   } }); // top-left corner → down-right
    fire({ particleCount: 130, angle: 240, spread: 75, startVelocity: 65, origin: { x: 1,   y: 0   } }); // top-right corner → down-left
  }, 100);

  // Wave 3 (230ms) — bottom-up rockets (THE MISSING DIRECTION)
  setTimeout(() => {
    fire({ particleCount: 130, angle: 90, spread: 60, startVelocity: 80, gravity: 0.8, origin: { x: 0.2, y: 1 } }); // bottom-left up
    fire({ particleCount: 130, angle: 90, spread: 60, startVelocity: 90, gravity: 0.8, origin: { x: 0.5, y: 1 } }); // bottom-center up
    fire({ particleCount: 130, angle: 90, spread: 60, startVelocity: 80, gravity: 0.8, origin: { x: 0.8, y: 1 } }); // bottom-right up
  }, 230);

  // Wave 4 (380ms) — top shower raining down across full width
  setTimeout(() => {
    fire({ particleCount: 120, spread: 180, startVelocity: 20, gravity: 1.3, decay: 0.91, origin: { x: 0.2, y: 0 } });
    fire({ particleCount: 120, spread: 180, startVelocity: 20, gravity: 1.3, decay: 0.91, origin: { x: 0.8, y: 0 } });
  }, 380);

  // Wave 5 (520ms) — mid-screen lateral spread + center burst
  setTimeout(() => {
    fire({ particleCount: 100, angle: 0,   spread: 70, startVelocity: 50, origin: { x: 0,   y: 0.5 } }); // left wall → right
    fire({ particleCount: 100, angle: 180, spread: 70, startVelocity: 50, origin: { x: 1,   y: 0.5 } }); // right wall → left
    fire({ particleCount: 100, spread: 360, startVelocity: 40, origin: { x: 0.5, y: 0.5 } });              // full 360° center burst
  }, 520);

  // Wave 6 (680ms) — final upward sweep across the bottom edge
  setTimeout(() => {
    fire({ particleCount: 90, angle: 80,  spread: 50, startVelocity: 70, gravity: 0.9, origin: { x: 0.1, y: 1 } });
    fire({ particleCount: 90, angle: 90,  spread: 50, startVelocity: 75, gravity: 0.9, origin: { x: 0.5, y: 1 } });
    fire({ particleCount: 90, angle: 100, spread: 50, startVelocity: 70, gravity: 0.9, origin: { x: 0.9, y: 1 } });
  }, 680);
}
// total: 250 + 520 + 390 + 240 + 300 + 270 = ~1,970 particles
