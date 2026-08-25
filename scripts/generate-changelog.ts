/**
 * Generates src/lib/changelog.generated.json from git log.
 * Run manually or via `pnpm changelog` / prebuild.
 *
 * Groups commits by week. Recognizes two commit styles:
 *   - conventional: "feat: ..." / "fix(scope): ..."
 *   - versioned (this project's actual convention): "v1.2.3: fix ..." /
 *     "v1.2.3: add ...", optionally with a nested conventional type
 *     ("v1.2.3: fix(cron): ..."). Commits under a versioned prefix with no
 *     recognized fix/add verb still count as "added" — everything gets a
 *     version bump here, so if it shipped, it's changelog-worthy. Internal
 *     types (chore/refactor/style/docs/etc.) are always skipped.
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

const VERSION_PREFIX = /^v\d+\.\d+\.\d+:\s*(.+)$/i;
const CONVENTIONAL = /^(feat|fix)(?:\([^)]+\))?:\s*(.+)$/i;
const INTERNAL_TYPE = /^(chore|refactor|style|docs|debug|perf|test|build|ci)(?:\([^)]+\))?:\s*/i;
const LEADING_FIX = /^fix(?:e[ds])?\b[:\s]*/i;
const LEADING_ADD = /^add(?:ed|s)?\b[:\s]*/i;

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Classifies a commit subject into a changelog type + message, or null to skip it. */
function classify(subject: string): { type: "feat" | "fix"; message: string } | null {
  const versioned = subject.match(VERSION_PREFIX);
  const rest = versioned ? versioned[1] : subject;

  // Nested conventional type, e.g. "v1.2.3: fix(cron): ..." or bare "fix(cron): ..."
  const conventional = rest.match(CONVENTIONAL);
  if (conventional) {
    return {
      type: conventional[1].toLowerCase() as "feat" | "fix",
      message: capitalize(conventional[2]),
    };
  }

  if (INTERNAL_TYPE.test(rest)) return null;

  if (LEADING_FIX.test(rest)) {
    return { type: "fix", message: capitalize(rest.replace(LEADING_FIX, "")) };
  }
  if (LEADING_ADD.test(rest)) {
    return { type: "feat", message: capitalize(rest.replace(LEADING_ADD, "")) };
  }

  // Versioned commit with no recognized verb — still shipped, count as "added".
  if (versioned) return { type: "feat", message: capitalize(rest) };

  return null;
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

    const classified = classify(subject);
    if (!classified) continue;

    commits.push({ hash, date, type: classified.type, message: classified.message });
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
