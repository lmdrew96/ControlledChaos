/**
 * Horizontal layout for tiles that overlap in one day column.
 *
 * Splitting every overlap into equal columns turned three collisions into
 * three slivers with unreadable titles. This follows Google Calendar instead:
 *
 * - Tiles that START close together (within SIDE_BY_SIDE_MS) sit side by
 *   side. Stacking those would hide the lower one's title completely.
 * - A tile that starts later CASCADES over what's already there: it keeps
 *   most of the column's width, indented a little, and is drawn on top. The
 *   earlier tile's title stays readable above it.
 *
 * Only a real overlap counts. A tile ending exactly when the next starts is
 * back to back and both keep the full width.
 */

export interface Spannable {
  id: string;
  startTime: string;
  endTime: string;
}

export interface TileLayout {
  /** Left edge, % of the day column. */
  leftPct: number;
  /** Width, % of the day column. */
  widthPct: number;
  /** Stacking order within the column; later-starting tiles are higher. */
  z: number;
  /** Too narrow for a wrapped title: show a one-line short label instead. */
  compact: boolean;
}

/** Starts this close together read as "at the same time". */
const SIDE_BY_SIDE_MS = 30 * 60_000;
/** Total indent budget for a cascade, so each tile keeps ~80% of the width. */
const CASCADE_INDENT_PCT = 20;
/** Below this width a title can't wrap legibly. */
const COMPACT_BELOW_PCT = 55;

const ms = (iso: string) => new Date(iso).getTime();

/** A zero-length tile still occupies its start instant. */
const effectiveEnd = (t: Spannable) => Math.max(ms(t.endTime), ms(t.startTime) + 1);

export function layoutOverlappingTiles(tiles: Spannable[]): Map<string, TileLayout> {
  const layout = new Map<string, TileLayout>();
  if (tiles.length === 0) return layout;

  const sorted = [...tiles].sort((a, b) => {
    const diff = ms(a.startTime) - ms(b.startTime);
    return diff !== 0 ? diff : effectiveEnd(b) - effectiveEnd(a);
  });

  // Clusters of transitively overlapping tiles. Strict `<`: touching
  // endpoints don't overlap.
  const clusters: Spannable[][] = [];
  let current: Spannable[] = [];
  let clusterEnd = -Infinity;
  for (const t of sorted) {
    if (current.length > 0 && ms(t.startTime) < clusterEnd) {
      current.push(t);
      clusterEnd = Math.max(clusterEnd, effectiveEnd(t));
    } else {
      if (current.length > 0) clusters.push(current);
      current = [t];
      clusterEnd = effectiveEnd(t);
    }
  }
  clusters.push(current);

  for (const cluster of clusters) {
    if (cluster.length === 1) {
      layout.set(cluster[0].id, { leftPct: 0, widthPct: 100, z: 0, compact: false });
      continue;
    }

    // Rows of tiles that start together; each row is laid side by side, and
    // each later row cascades over the ones before it.
    const rows: Spannable[][] = [];
    for (const t of cluster) {
      const row = rows[rows.length - 1];
      if (row && ms(t.startTime) - ms(row[0].startTime) < SIDE_BY_SIDE_MS) row.push(t);
      else rows.push([t]);
    }

    const step = rows.length > 1 ? CASCADE_INDENT_PCT / (rows.length - 1) : 0;
    rows.forEach((row, depth) => {
      const rowLeft = depth * step;
      // Every row spans the same width, so the indent is all that differs.
      const rowWidth = rows.length > 1 ? 100 - CASCADE_INDENT_PCT : 100;
      const tileWidth = rowWidth / row.length;
      row.forEach((t, i) => {
        layout.set(t.id, {
          leftPct: rowLeft + i * tileWidth,
          widthPct: tileWidth,
          z: depth,
          compact: tileWidth < COMPACT_BELOW_PCT,
        });
      });
    });
  }

  return layout;
}

/**
 * One-line label for a narrow tile: the course code when there is one
 * ("LATN 101 - Elementary Latin I" → "LATN 101"), else the first two words.
 */
export function shortTileTitle(title: string): string {
  const course = title.match(/\b([A-Z]{2,5})\s*-?\s*(\d{3}[A-Z]?)\b/);
  if (course) return `${course[1]} ${course[2]}`;
  const words = title.trim().split(/\s+/);
  const short = words.length > 2 ? words.slice(0, 2).join(" ") : title.trim();
  return short.replace(/[\s:;,.–—-]+$/, "");
}
