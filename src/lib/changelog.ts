/**
 * User-facing changelog — what "What's New" shows.
 *
 * Hand-written in plain language, one entry per batch of releases that
 * shipped together. This is what users read, not a commit log. Newest first;
 * CHANGELOG[0] is the current release.
 *
 * It used to be generated from `git log` at build time. Workers Builds clones
 * shallow, so the build only ever saw one commit and What's New showed one
 * line. Writing it by hand fixes that and reads better anyway.
 *
 * When you ship a version: add its changes to the newest entry (widening its
 * `label` range and bumping `version`), or start a new entry. `version` must
 * equal package.json's — scripts/check-changelog.ts fails the build otherwise,
 * because the "new" dot keys off it.
 */

export type ChangeKind = "added" | "improved" | "fixed";

export interface ChangelogChange {
  kind: ChangeKind;
  text: string;
}

export interface ChangelogEntry {
  /** Semver of the last release in this batch. Used for ordering and "seen". */
  version: string;
  /** Display range when the entry covers several releases, e.g. "2.70.15 – 2.73.2". */
  label?: string;
  /** YYYY-MM-DD the batch shipped. */
  date: string;
  title: string;
  changes: ChangelogChange[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "2.80.5",
    label: "2.80.0 – 2.80.5",
    date: "2026-09-26",
    title: "Goals you can move",
    changes: [
      {
        kind: "fixed",
        text: "Choosing which Canvas courses to sync works again, and your Canvas calendar keeps syncing in the background.",
      },
      {
        kind: "fixed",
        text: "Viewing one goal's or one brain dump's tasks, the Active and Done counts now count only those tasks.",
      },
      {
        kind: "fixed",
        text: "Goals Claude set up before this update show their target day correctly instead of one day late.",
      },
      {
        kind: "added",
        text: "Every goal has its own page. Tap a card to read the whole description, see its steps, check them off, add a step in one line, or link tasks you already have.",
      },
      {
        kind: "added",
        text: "“Break it down” suggests a few first steps for a goal. Keep the ones you like; nothing is added until you do.",
      },
      {
        kind: "added",
        text: "Finishing a goal's last step asks whether to call the goal done, and you can jot down how it went. Finished goals remember when they wrapped up and what you wrote.",
      },
      {
        kind: "added",
        text: "Your top three goals sit on the dashboard with their next step. Drag goals on the Goals page to choose which three.",
      },
      {
        kind: "added",
        text: "Say a bigger aim in a brain dump (“I want to get my GPA up this semester”) and it becomes a goal, with that dump's related tasks linked to it.",
      },
      {
        kind: "improved",
        text: "Goal cards show what's next and how many steps you've done this week, instead of a percentage that dropped whenever you added a step. A passed target date just says so, with no red.",
      },
      {
        kind: "improved",
        text: "“Do This Next” knows why your goals matter, not just their names, and uses that to break ties.",
      },
    ],
  },
  {
    version: "2.79.1",
    label: "2.75.0 – 2.79.1",
    date: "2026-09-26",
    title: "Room to get there",
    changes: [
      {
        kind: "fixed",
        text: "Goals show the target day you picked, not the day before. Finished and paused goals stay reachable when nothing is active, switching goal tabs is instant, and a task linked to a paused goal still shows it.",
      },
      {
        kind: "added",
        text: "Claude can plan a task across several sittings, like a reading split over Saturday, Sunday and Monday, and move or drop one without touching the others. They show up as that task's sessions, the same as ones you plan in the app.",
      },
      {
        kind: "improved",
        text: "Reminders arrive on time, to the minute. A “10 minutes before” reminder for a 12:45 class now comes at 12:35, not whenever the next 10-minute check happened to run.",
      },
      {
        kind: "fixed",
        text: "Small stuff: a brain dump with nothing actionable in it says so, search shows your latest tasks, Microtasks shows a loading state instead of “No microtasks yet”, the week header reads “Sep 28 – Oct 4”, and calendar times all look alike.",
      },
      {
        kind: "fixed",
        text: "Rescue plans without a hard deadline no longer say “Due No hard deadline”, and your own target shows the right day. Digest emails keep past-due tasks out of “this week” and don't call tonight's deadline “tomorrow's top priority”.",
      },
      {
        kind: "improved",
        text: "Morning and evening emails know what the app knows about each task: its estimate, the goal it's for, your next session, and whether you've already started it.",
      },
      {
        kind: "improved",
        text: "Warning, success and alert colors in Rescue, Moments, the calendar and notifications now come from the app's own palette, in light and dark.",
      },
      {
        kind: "added",
        text: "Hide the sidebar on bigger screens with the button next to the logo. It folds into one small button in the corner, and remembers your choice.",
      },
      {
        kind: "improved",
        text: "Tapping a task shows it first: the full description, due and target dates, next session, goal and steps, with nothing to change by accident. Hit Edit when you do want to change something.",
      },
      {
        kind: "improved",
        text: "Planning knows you have to travel. When back-to-back events are at different saved places, Plan my day, Find me a time and Rescue plans all leave your commute free instead of filling it with work.",
      },
    ],
  },
  {
    version: "2.74.1",
    label: "2.70.15 – 2.74.1",
    date: "2026-09-25",
    title: "Things connect to each other now",
    changes: [
      {
        kind: "added",
        text: "Cancel a task from its ··· menu. Cancelled tasks get their own tab, where one tap brings them back — including ones Claude cancelled for you.",
      },
      {
        kind: "added",
        text: "Click your way around: a goal's “3/5 tasks” lists those tasks, a planned block on the calendar opens its task, a brain dump lands on exactly what it made, and Daily Recap rows open the thing they're about.",
      },
      {
        kind: "added",
        text: "Microtasks count. Checking one off shows up in your Daily Recap and tells check-ins you've been doing stuff today.",
      },
      {
        kind: "improved",
        text: "Canvas keeps up: an assignment your instructor deletes leaves your task list, and turning a course back on brings its tasks back.",
      },
      {
        kind: "improved",
        text: "Rescue steps, recommendations and goal descriptions show formatting instead of stray asterisks.",
      },
      {
        kind: "fixed",
        text: "“Just now” in the notification bell, the calendar's now-line, and which day is today stay current in a tab you leave open all day.",
      },
      {
        kind: "fixed",
        text: "Month view puts events on the same day as week view does, in your timezone.",
      },
      {
        kind: "fixed",
        text: "Replanning a task or clearing today's plan no longer erases sessions you already logged.",
      },
      {
        kind: "fixed",
        text: "Dragging tasks into your own order actually saves now.",
      },
      {
        kind: "fixed",
        text: "Deleting the saved location you're standing in works, and “Home” no longer matches “Homework Lab”.",
      },
      {
        kind: "fixed",
        text: "Subscribed calendars show every session of a split task, not just one.",
      },
      {
        kind: "fixed",
        text: "Turning location suggestions on or off takes effect right away, no reload.",
      },
      {
        kind: "fixed",
        text: "Cancelled tasks stop sending “time to start” pushes.",
      },
      {
        kind: "fixed",
        text: "What's New lists everything again, instead of one line.",
      },
      {
        kind: "improved",
        text: "Finishing a task closes its Rescue plan, and closed plans show up in your Daily Recap.",
      },
      {
        kind: "improved",
        text: "Rescue warnings notice tasks with no time estimate, and snoozed tasks once the snooze runs out.",
      },
      {
        kind: "fixed",
        text: "Dismissing a Rescue warning sticks, even with push notifications off.",
      },
      {
        kind: "improved",
        text: "“Do This Next” knows which goal a task serves and what you've already planned today.",
      },
      {
        kind: "improved",
        text: "One name per thing: it's “Rescue” everywhere, a planned block of work is a “session” everywhere, and features stopped sharing icons.",
      },
      {
        kind: "fixed",
        text: "Daylight-saving days (23 or 25 hours long) no longer knock your plan, recap or digests off by an hour.",
      },
    ],
  },
  {
    version: "2.70.14",
    label: "2.69.0 – 2.70.14",
    date: "2026-09-25",
    title: "Pushes that don't keep time like a metronome",
    changes: [
      {
        kind: "improved",
        text: "Every alert gets one chance. No more follow-ups for a start you missed, and no pushes landing on the same ten-minute beat.",
      },
      {
        kind: "improved",
        text: "Claude can link tasks to goals, and goals and completions work the same whether you use the app or Claude.",
      },
      {
        kind: "fixed",
        text: "Snooze on a push works even when you're signed out on that device, and snoozed tasks stop asking you to start them.",
      },
      {
        kind: "fixed",
        text: "Canvas class meetings skip the day-before reminder; exams and quizzes keep it.",
      },
      {
        kind: "fixed",
        text: "Your energy reads your latest energy moment, and momentum counts days by your local date.",
      },
      {
        kind: "fixed",
        text: "A page that fails to load shows a retry button instead of pretending you have no tasks.",
      },
    ],
  },
  {
    version: "2.68.2",
    label: "2.60.13 – 2.68.2",
    date: "2026-09-24",
    title: "Sessions, and a quieter morning",
    changes: [
      {
        kind: "added",
        text: "Split a task across several sessions. The estimate splits with it, and the task shows your next session.",
      },
      {
        kind: "added",
        text: "Log how a session went: done, partly, or skipped.",
      },
      {
        kind: "added",
        text: "Pushes that piled up overnight arrive as one wake-up summary.",
      },
      {
        kind: "improved",
        text: "Overlapping calendar events cascade so you can read them; back-to-back ones stay full width. Canvas quizzes ride on their class as a badge.",
      },
      {
        kind: "improved",
        text: "Reminders stick to their own item instead of tacking on other homework.",
      },
      {
        kind: "fixed",
        text: "Turning push off stops every push, including the ones that ignore quiet hours.",
      },
      {
        kind: "fixed",
        text: "No day-before reminders for recurring events, and no reminders that show up long after they mattered.",
      },
    ],
  },
  {
    version: "2.60.12",
    label: "2.58.0 – 2.60.12",
    date: "2026-09-22",
    title: "New home under the hood",
    changes: [
      {
        kind: "improved",
        text: "ControlledChaos moved to Cloudflare. Same app, a lot less waiting on background work.",
      },
      {
        kind: "added",
        text: "Reminders for events at your saved locations.",
      },
      {
        kind: "fixed",
        text: "Signing in lands you on your dashboard, and an open tab notices new versions when you come back to it.",
      },
    ],
  },
];

export const LATEST_VERSION = CHANGELOG[0]?.version ?? "";

/** Negative when a < b, positive when a > b. Missing segments count as 0. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

const DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

/** An entry's YYYY-MM-DD for display, read as UTC so it never shifts a day. */
export function formatEntryDate(isoDate: string): string {
  return DATE_FORMATTER.format(new Date(`${isoDate}T00:00:00Z`));
}
