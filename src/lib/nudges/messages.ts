import type { TaskCategory } from "@/types";

export const NUDGE_MESSAGES: Record<TaskCategory, string[]> = {
  school: [
    "Your friend thinks you should tackle some schoolwork — you've got this!",
    "Study nudge! Even 10 minutes of focus makes a difference.",
    "Your friend believes in your brain — time to crack open that school stuff!",
  ],
  work: [
    "Work nudge incoming! Pick one thing and knock it out.",
    "Your friend says: get that work thing done, future you will be relieved!",
    "Friendly work poke — what's the smallest work task you can finish right now?",
  ],
  personal: [
    "Your friend's reminding you to take care of your personal stuff!",
    "Personal task nudge — you deserve to have your life feel put-together.",
    "Hey! Your friend thinks you should handle that personal to-do.",
  ],
  errands: [
    "Errand nudge! Your friend thinks it's a good time to cross one off the list.",
    "Your friend says: go run that errand while you're thinking about it!",
    "Quick errand reminder from a friend — momentum starts with one step!",
  ],
  health: [
    "Your friend wants you to take care of yourself today!",
    "Health check nudge — have you moved, eaten, hydrated?",
    "Self-care reminder from a friend who cares about you!",
  ],
};

export const MAX_NUDGES_PER_FRIEND_PER_DAY = 3;

export const CATEGORY_LABELS: Record<TaskCategory, string> = {
  school: "School",
  work: "Work",
  personal: "Personal",
  errands: "Errands",
  health: "Health",
};

export const VALID_CATEGORIES: TaskCategory[] = [
  "school",
  "work",
  "personal",
  "errands",
  "health",
];

export const pickRandomMessage = (category: TaskCategory): string => {
  const messages = NUDGE_MESSAGES[category];
  return messages[Math.floor(Math.random() * messages.length)];
};
