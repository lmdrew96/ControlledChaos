import confetti from "canvas-confetti";

const COLORS = [
  "#ff6b6b", "#ffd93d", "#6bcb77",
  "#4d96ff", "#c77dff", "#ff9f43",
  "#ff4757", "#eccc68", "#2ed573",
  "#1e90ff", "#a29bfe", "#fd79a8",
];

/**
 * Full-window confetti storm. Fires ~1200 particles across multiple waves
 * covering the entire viewport. Use this for task completions.
 */
export function fireTaskConfetti() {
  const fire = (opts: confetti.Options) =>
    confetti({ colors: COLORS, zIndex: 9999, ...opts });

  // Wave 1 (0ms) — massive center cannon
  fire({ particleCount: 200, spread: 120, startVelocity: 55, origin: { x: 0.5, y: 0.6 } });

  // Wave 2 (100ms) — hard left and right cannons
  setTimeout(() => {
    fire({ particleCount: 150, angle: 55, spread: 80, startVelocity: 60, origin: { x: 0, y: 0.65 } });
    fire({ particleCount: 150, angle: 125, spread: 80, startVelocity: 60, origin: { x: 1, y: 0.65 } });
  }, 100);

  // Wave 3 (220ms) — three points across the top mid
  setTimeout(() => {
    fire({ particleCount: 100, spread: 90, startVelocity: 50, origin: { x: 0.2, y: 0.5 } });
    fire({ particleCount: 100, spread: 90, startVelocity: 50, origin: { x: 0.8, y: 0.5 } });
    fire({ particleCount: 100, spread: 60, startVelocity: 65, origin: { x: 0.5, y: 0.4 } });
  }, 220);

  // Wave 4 (380ms) — overhead shower raining down across full width
  setTimeout(() => {
    fire({ particleCount: 80, spread: 180, startVelocity: 30, gravity: 1.2, decay: 0.93, origin: { x: 0.25, y: 0.1 } });
    fire({ particleCount: 80, spread: 180, startVelocity: 30, gravity: 1.2, decay: 0.93, origin: { x: 0.75, y: 0.1 } });
  }, 380);

  // Wave 5 (560ms) — final diagonal crossfire
  setTimeout(() => {
    fire({ particleCount: 100, angle: 70, spread: 70, startVelocity: 55, origin: { x: 0.1, y: 0.8 } });
    fire({ particleCount: 100, angle: 110, spread: 70, startVelocity: 55, origin: { x: 0.9, y: 0.8 } });
    fire({ particleCount: 80, spread: 100, startVelocity: 40, origin: { x: 0.5, y: 0.7 } });
  }, 560);
}
