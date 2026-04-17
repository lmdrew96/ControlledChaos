/**
 * Generates src/lib/changelog.generated.json from git log.
 * Run manually or via `pnpm changelog` / prebuild.
 *
 * Groups commits by week. Only includes feat: and fix: commits.
 */

import { execSync } from "child_process";
import { writeFileSync } from "fs";
import { resolve } from "path";

interface CommitInfo {
  hash: string;
  date: string; // YYYY-MM-DD
  type: "feat" | "fix";
  message: string;
}

interface ChangelogWeek {
  weekOf: string; // YYYY-MM-DD (Monday of that week)
  items: { type: "added" | "fixed"; text: string }[];
}

function parseCommits(): CommitInfo[] {
  const raw = execSync(
    'git log --format="%H|%ad|%s" --date=short',
    { encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 }
  );

  const commits: CommitInfo[] = [];

  for (const line of raw.trim().split("\n")) {
    if (!line) continue;
    const firstPipe = line.indexOf("|");
    const secondPipe = line.indexOf("|", firstPipe + 1);
    if (firstPipe === -1 || secondPipe === -1) continue;

    const hash = line.slice(0, firstPipe);
    const date = line.slice(firstPipe + 1, secondPipe);
    const subject = line.slice(secondPipe + 1);

    // Only feat: and fix: conventional commits — scope optional, e.g.
    // "feat: ..." or "feat(moments): ..."
    const match = subject.match(/^(feat|fix)(?:\([^)]+\))?:\s*(.+)$/i);
    if (!match) continue;

    commits.push({
      hash,
      date,
      type: match[1].toLowerCase() as "feat" | "fix",
      message: match[2].charAt(0).toUpperCase() + match[2].slice(1),
    });
  }

  return commits;
}

function getMonday(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d.toISOString().slice(0, 10);
}

function groupByWeek(commits: CommitInfo[]): ChangelogWeek[] {
  const weeks = new Map<string, ChangelogWeek>();

  for (const c of commits) {
    const monday = getMonday(c.date);
    let week = weeks.get(monday);
    if (!week) {
      week = { weekOf: monday, items: [] };
      weeks.set(monday, week);
    }
    week.items.push({
      type: c.type === "feat" ? "added" : "fixed",
      text: c.message,
    });
  }

  // Sort weeks descending (most recent first)
  return Array.from(weeks.values()).sort(
    (a, b) => b.weekOf.localeCompare(a.weekOf)
  );
}

function main() {
  const commits = parseCommits();
  const weeks = groupByWeek(commits);

  const outPath = resolve(__dirname, "../src/lib/changelog.generated.json");
  writeFileSync(outPath, JSON.stringify(weeks, null, 2) + "\n");

  console.log(
    `Changelog generated: ${weeks.length} weeks, ${commits.length} entries → ${outPath}`
  );
}

main();
