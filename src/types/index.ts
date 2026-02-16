// ============================================================
// Task Types
// ============================================================

/** Task as returned from the API (serialized dates as strings) */
export interface Task {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  energyLevel: string;
  estimatedMinutes: number | null;
  category: string | null;
  locationTags: string[] | null;
  deadline: string | null;
  scheduledFor: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

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

export type LocationTag = "home" | "campus" | "work";

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
  locationTags?: LocationTag[];
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
  upcomingEvents?: Array<{
    title: string;
    startTime: string;
    endTime: string;
    source: string;
  }>;
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

export interface PushSubscriptionData {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

// ============================================================
// Calendar Types
// ============================================================
export type CalendarSource = "canvas" | "google" | "controlledchaos";

export interface CalendarEvent {
  id: string;
  userId: string;
  source: CalendarSource;
  externalId: string | null;
  title: string;
  description: string | null;
  startTime: string;
  endTime: string;
  location: string | null;
  isAllDay: boolean;
  syncedAt: string;
}

export interface CalendarSyncResult {
  created: number;
  updated: number;
  deleted: number;
  total: number;
}

// ============================================================
// AI Scheduling Types
// ============================================================
export interface ScheduledBlock {
  taskId: string;
  startTime: string;
  endTime: string;
  reasoning: string;
}

export interface ScheduleResult {
  blocks: ScheduledBlock[];
  eventsCreated: number;
  googleEventsCreated: number;
  message: string;
}

export interface FreeTimeBlock {
  start: string;
  end: string;
  durationMinutes: number;
}

// ============================================================
// Goal Types
// ============================================================
export type GoalStatus = "active" | "completed" | "paused";
