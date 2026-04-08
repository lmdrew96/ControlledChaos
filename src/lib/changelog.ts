import generatedChangelog from "./changelog.generated.json";

export interface ChangelogWeek {
  weekOf: string; // YYYY-MM-DD (Monday of that week)
  items: {
    type: "added" | "fixed";
    text: string;
  }[];
}

export const changelog: ChangelogWeek[] = generatedChangelog as ChangelogWeek[];

/** Returns the weekOf string from the most recent changelog entry (used for "seen" tracking). */
export function getLatestWeek(): string {
  return changelog[0]?.weekOf ?? "";
}
