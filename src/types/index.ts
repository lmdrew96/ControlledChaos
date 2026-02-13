// ============================================================
// Task Types
// ============================================================
export type TaskStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "snoozed"
  | "cancelled";

export type TaskPriority = "urgent" | "important" | "normal" | "someday";

export type EnergyLevel = "low" | "medium" | "high";

export type TaskCategory =
  | "school"
  | "work"
  | "personal"
  | "errands"
  | "health";

export type LocationTag = "home" | "campus" | "work" | "anywhere";

// ============================================================
// Brain Dump Types
// ============================================================
export type DumpInputType = "text" | "voice" | "photo";

export interface ParsedTask {
  title: string;
  description?: string;
  priority: TaskPriority;
  energyLevel: EnergyLevel;
  estimatedMinutes?: number;
  category?: TaskCategory;
  locationTag?: LocationTag;
  deadline?: string;
  goalConnection?: string;
}

export interface BrainDumpResult {
  tasks: ParsedTask[];
  summary: string;
}

// ============================================================
// Recommendation Types
// ============================================================
export interface UserContext {
  currentTime: string;
  timezone: string;
  location?: {
    name: string;
    latitude: number;
    longitude: number;
  };
  nextEvent?: {
    title: string;
    startTime: string;
    minutesUntil: number;
  };
  energyLevel?: EnergyLevel;
  recentActivity?: {
    tasksCompletedToday: number;
    lastAction?: string;
    lastActionTime?: string;
  };
}

export interface TaskRecommendation {
  taskId: string;
  reasoning: string;
  alternatives: Array<{
    taskId: string;
    reasoning: string;
  }>;
}

// ============================================================
// User Settings Types
// ============================================================
export interface EnergyProfile {
  morning: EnergyLevel; // 6am-12pm
  afternoon: EnergyLevel; // 12pm-5pm
  evening: EnergyLevel; // 5pm-9pm
  night: EnergyLevel; // 9pm-12am
}

export interface NotificationPrefs {
  pushEnabled: boolean;
  emailMorningDigest: boolean;
  emailEveningDigest: boolean;
  morningDigestTime: string; // "07:30"
  eveningDigestTime: string; // "21:00"
  quietHoursStart: string; // "22:00"
  quietHoursEnd: string; // "07:00"
}

// ============================================================
// Calendar Types
// ============================================================
export type CalendarSource = "canvas" | "google" | "controlledchaos";

// ============================================================
// Goal Types
// ============================================================
export type GoalStatus = "active" | "completed" | "paused";
