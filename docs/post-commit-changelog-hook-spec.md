# Post-Commit Changelog Hook Spec

## Purpose

Automatically regenerate a changelog JSON file after every `feat:` or `fix:` commit, then amend it into that same commit so the changelog never drifts out of sync.

## Prerequisites

1. **Conventional commits** — the repo uses `feat:` and `fix:` prefixes (other prefixes like `chore:`, `docs:`, `refactor:` are ignored by the changelog).

2. **A changelog generator script** that:
   - Parses `git log` for `feat:` and `fix:` commits
   - Groups them by week (Monday start)
   - Outputs a JSON file at a known path (e.g. `src/lib/changelog.generated.json`)
   - Can be run via a single command (e.g. `npx tsx scripts/generate-changelog.ts` or `pnpm changelog`)

3. **The output JSON path** — wherever the generated changelog lives in this repo.

## Hook: `.git/hooks/post-commit`

```sh
#!/bin/sh
# Regenerate changelog after every feat/fix commit, amend it in silently.

LAST_MSG=$(git log -1 --format="%s")

# Don't recurse — skip if this commit is the changelog amend itself
case "$LAST_MSG" in
  *"chore: update changelog"*) exit 0 ;;
esac

# Only regenerate if the commit is a feat or fix
case "$LAST_MSG" in
  feat:*|fix:*) ;;
  *) exit 0 ;;
esac

# Regenerate changelog — REPLACE THIS COMMAND with the repo's generator
npx tsx scripts/generate-changelog.ts >/dev/null 2>&1

# If the file changed, amend it into the commit we just made — REPLACE THE PATH
if ! git diff --quiet src/lib/changelog.generated.json 2>/dev/null; then
  git add src/lib/changelog.generated.json
  git commit --amend --no-edit --no-verify >/dev/null 2>&1
fi
```

## What to customize per repo

| Item | Example | What to change |
|------|---------|----------------|
| Generator command | `npx tsx scripts/generate-changelog.ts` | Whatever command generates the changelog in this repo |
| Output file path | `src/lib/changelog.generated.json` | The path to the generated changelog file |
| Recursion guard string | `"chore: update changelog"` | Match whatever message the amend produces (shouldn't need changing since `--no-edit` preserves the original message) |
| Commit prefixes | `feat:*\|fix:*` | Add more if the repo tracks other types in the changelog (e.g. `perf:*`) |

## Setup steps

1. If the repo doesn't have a changelog generator script yet, create one (see reference implementation below).
2. Create `.git/hooks/post-commit` with the contents above (customized).
3. `chmod +x .git/hooks/post-commit`
4. Test: make a `feat: test` commit and verify the changelog file is included in it.

## Notes

- `.git/hooks/` is not tracked by git — this hook is local to each clone. For portability, consider `simple-git-hooks` or `husky` in `package.json`.
- The hook uses `--no-verify` on the amend to avoid re-triggering pre-commit hooks (linting, etc.) on a file that was just generated.
- The amend preserves the original commit message (`--no-edit`), so the changelog update is invisible in git log.
- If the generator fails silently, the commit still succeeds — the hook is non-blocking.

## Reference: Changelog Generator Script

This is the pattern used in ControlledChaos. Adapt the output path and format for each repo.

```typescript
import { execSync } from "child_process";
import { writeFileSync } from "fs";
import { resolve } from "path";

interface ChangelogWeek {
  weekOf: string;
  items: { type: "added" | "fixed"; text: string }[];
}

function parseCommits() {
  const raw = execSync(
    'git log --format="%H|%ad|%s" --date=short',
    { encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 }
  );

  const commits = [];
  for (const line of raw.trim().split("\n")) {
    if (!line) continue;
    const firstPipe = line.indexOf("|");
    const secondPipe = line.indexOf("|", firstPipe + 1);
    if (firstPipe === -1 || secondPipe === -1) continue;

    const date = line.slice(firstPipe + 1, secondPipe);
    const subject = line.slice(secondPipe + 1);
    const match = subject.match(/^(feat|fix):\s*(.+)$/i);
    if (!match) continue;

    commits.push({
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

function groupByWeek(commits: ReturnType<typeof parseCommits>): ChangelogWeek[] {
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
  return Array.from(weeks.values()).sort(
    (a, b) => b.weekOf.localeCompare(a.weekOf)
  );
}

// --- CUSTOMIZE THIS PATH ---
const outPath = resolve(__dirname, "../src/lib/changelog.generated.json");
const commits = parseCommits();
const weeks = groupByWeek(commits);
writeFileSync(outPath, JSON.stringify(weeks, null, 2) + "\n");
console.log(`Changelog: ${weeks.length} weeks, ${commits.length} entries`);
```
