/**
 * Stacking order for tiles that overlap in one day column.
 *
 * Every tile keeps the full column width (Nae, 10/18: overlapping beats
 * partial width). Splitting or indenting overlaps squeezed titles down to
 * "CGS..." and "Mee...", which told you nothing. Instead a tile that starts
 * later is drawn on top, so the earlier tile's title stays readable above
 * it; hover or focus lifts any tile to the front.
 *
 * Only a real overlap counts. A tile ending exactly when the next starts is
 * back to back and both stay at the bottom of the stack.
 */

export interface Spannable {
  id: string;
  startTime: string;
  endTime: string;
}

export interface TileLayout {
  /** Stacking order within the column; later-starting tiles are higher. */
  z: number;
}

const ms = (iso: string) => new Date(iso).getTime();

/** A zero-length tile still occupies its start instant. */
const effectiveEnd = (t: Spannable) => Math.max(ms(t.endTime), ms(t.startTime) + 1);

export function layoutOverlappingTiles(tiles: Spannable[]): Map<string, TileLayout> {
  const layout = new Map<string, TileLayout>();

  // Same start: the longer tile goes underneath, so the shorter one on top
  // leaves the longer one's lower part showing.
  const sorted = [...tiles].sort((a, b) => {
    const diff = ms(a.startTime) - ms(b.startTime);
    return diff !== 0 ? diff : effectiveEnd(b) - effectiveEnd(a);
  });

  // Depth restarts with each cluster of transitively overlapping tiles.
  // Strict `<`: touching endpoints don't overlap.
  let depth = 0;
  let clusterEnd = -Infinity;
  for (const t of sorted) {
    depth = ms(t.startTime) < clusterEnd ? depth + 1 : 0;
    clusterEnd = depth === 0 ? effectiveEnd(t) : Math.max(clusterEnd, effectiveEnd(t));
    layout.set(t.id, { z: depth });
  }

  return layout;
}
