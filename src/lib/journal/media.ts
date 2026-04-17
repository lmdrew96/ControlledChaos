/**
 * Resolve the display media list for a brain_dump row.
 *
 * Old rows (pre-multi-media patch) have only `mediaUrl`. New rows populate
 * both `mediaUrl` (first URL, back-compat) and `mediaUrls` (full array).
 * This helper gives readers a single unified list regardless of which
 * schema era the row was written in.
 */
export function resolveMediaUrls(dump: {
  mediaUrl?: string | null;
  mediaUrls?: string[] | null;
}): string[] {
  if (dump.mediaUrls && dump.mediaUrls.length > 0) return dump.mediaUrls;
  if (dump.mediaUrl) return [dump.mediaUrl];
  return [];
}
