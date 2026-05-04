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
  sourceDumpId: string | null;
  sourceEventId: string | null;
  progressSteps: ProgressStep[] | null;
  currentStepIndex: number;
  goalId: string | null;
  sortOrder?: number | null;
  /** Parallel-play visibility tier — controls what room presence broadcasts when this task is active. */
  roomVisibility?: "none" | "category" | "title";
  createdAt: string;
  updatedAt: string;
}

export interface ProgressStep {
  title: string;
  estimatedMinutes: number;
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

export type LocationTag = string;

// ============================================================
// Brain Dump Types
// ============================================================
export type DumpInputType = "text" | "voice" | "photo";
export type DumpCategory = "braindump" | "junk_journal";

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

export interface ParsedCalendarEvent {
  title: string;
  description?: string;
  location?: string;
  startTime: string; // ISO 8601
  endTime: string; // ISO 8601
  isAllDay?: boolean;
  recurrence?: {
    type: "daily" | "weekly";
    daysOfWeek?: number[]; // 0=Sun, 1=Mon, ..., 6=Sat
    endDate?: string; // ISO 8601
  };
}

export interface BrainDumpResult {
  tasks: ParsedTask[];
  events: ParsedCalendarEvent[];
  summary: string;
}

// ============================================================
// Moment Types (typed behavioral state log)
// ============================================================
export type MomentType =
  | "energy_high"
  | "energy_low"
  | "energy_crash"
  | "focus_start"
  | "focus_end"
  | "tough_moment"
  | "sleep_logged";

export type MomentSource = "manual" | "voice";

export interface Moment {
  id: string;
  type: MomentType;
  intensity: number | null; // 1-5
  note: string | null;
  occurredAt: string; // ISO 8601
  source: MomentSource;
  createdAt: string;
}

export interface MomentInput {
  type: MomentType;
  intensity?: number | null;
  note?: string | null;
  occurredAt?: string; // defaults to now
}

/** Lightweight shape for crisis detection + AI recommendation inputs */
export interface RecentMoment {
  type: MomentType;
  intensity: number | null;
  occurredAt: Date;
}

// ============================================================
// Daily Recap View Types (chronological day timeline)
// ============================================================
export type RecapKind =
  | "task"
  | "event"
  | "dump"
  | "journal"
  | "moment"
  | "med";

interface RecapEntryBase {
  id: string;
  /** ISO 8601 UTC timestamp used for ordering */
  at: string;
}

export type RecapEntry =
  | (RecapEntryBase & {
      kind: "task";
      title: string;
      category: string | null;
    })
  | (RecapEntryBase & {
      kind: "event";
      endAt: string;
      title: string;
      location: string | null;
      isAllDay: boolean;
    })
  | (RecapEntryBase & {
      kind: "dump";
      summary: string | null;
      inputType: DumpInputType;
    })
  | (RecapEntryBase & {
      kind: "journal";
      summary: string | null;
      inputType: DumpInputType;
      mediaCount: number;
    })
  | (RecapEntryBase & {
      kind: "moment";
      type: MomentType;
      intensity: number | null;
      note: string | null;
    })
  | (RecapEntryBase & {
      kind: "med";
      medicationName: string;
      dosage: string;
    });

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
  currentEvent?: {
    title: string;
    endTime: string;
    minutesUntilFree: number;
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
  /** Most recent energy signal derived from Moments, or null if none recent */
  energyLevel?: EnergyLevel | null;
  /** Most recent Moment (any type) for AI prompt context */
  recentMoment?: {
    type: MomentType;
    intensity: number | null;
    note: string | null;
    minutesAgo: number;
  } | null;
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
/**
 * @deprecated Retired in favor of Moments. Column remains in DB pending follow-up
 * migration; type kept only for the residual dead-column read path.
 */
export interface EnergyProfile {
  morning: EnergyLevel; // 6am-12pm
  afternoon: EnergyLevel; // 12pm-5pm
  evening: EnergyLevel; // 5pm-9pm
  night: EnergyLevel; // 9pm-12am
}

export type NotificationAssertiveness = "gentle" | "balanced" | "assertive";

export type CelebrationLevel = "none" | "subtle" | "full";

export type DailyCheckInTime = "morning" | "afternoon" | "evening";

export interface NotificationPrefs {
  pushEnabled: boolean;
  locationNotificationsEnabled: boolean;
  emailMorningDigest: boolean;
  emailEveningDigest: boolean;
  morningDigestTime: string; // "07:30"
  eveningDigestTime: string; // "21:00"
  quietHoursStart: string; // "22:00"
  quietHoursEnd: string; // "07:00"
  assertivenessMode: NotificationAssertiveness;
  friendNudgesEnabled: boolean;
  mutedFriendIds: string[];
  celebrationLevel: CelebrationLevel;
  momentumStyle: "motivational" | "neutral";
  /** Minutes before a deadline/event to fire a reminder. Defaults to [1440, 60, 10] (1 day, 1 hour, 10 min). */
  reminderIntervals?: number[];
  /** Whether to send a once-daily idle check-in. If undefined, derived from assertivenessMode. */
  dailyCheckInEnabled?: boolean;
  /** Which time window the daily check-in fires in. If undefined, defaults to "morning". */
  dailyCheckInTime?: DailyCheckInTime;
}

export const DEFAULT_REMINDER_INTERVALS: number[] = [1440, 60, 10];

export interface PersonalityPrefs {
  /** 0 = strict, 1 = balanced, 2 = supportive */
  supportive: 0 | 1 | 2;
  /** 0 = professional, 1 = friendly, 2 = BFF */
  formality: 0 | 1 | 2;
  /** 0 = clean, 1 = casual, 2 = unfiltered */
  language: 0 | 1 | 2;
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
export type CalendarSource = "canvas" | "google" | "controlledchaos"; // "google" kept for backward compat with existing DB rows

export type CalendarColorKey = "blue" | "purple" | "green" | "orange" | "red" | "pink" | "teal" | "yellow";

export type EventCategory = TaskCategory; // Same categories: school, work, personal, errands, health

export interface CalendarColors {
  school: CalendarColorKey;
  work: CalendarColorKey;
  personal: CalendarColorKey;
  errands: CalendarColorKey;
  health: CalendarColorKey;
}

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
  category: EventCategory | null;
  isAllDay: boolean;
  seriesId: string | null;
  sourceDumpId: string | null;
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

export interface Goal {
  id: string;
  title: string;
  description: string | null;
  targetDate: string | null;
  status: GoalStatus;
  createdAt: string;
  taskCount?: number;
  completedTaskCount?: number;
}

// ============================================================
// Crisis Mode Types
// ============================================================
export type PanicLevel = "fine" | "tight" | "damage-control";

export interface CrisisTask {
  title: string;
  instruction: string;
  estimatedMinutes: number;
  stuckHint: string;
}

export interface CrisisPlan {
  panicLevel: PanicLevel;
  panicLabel: string;
  summary: string;
  tasks: CrisisTask[];
  /** AI-generated clarifying questions to surface before or during execution */
  questions?: string[];
}

export interface CrisisMessage {
  id: string;
  crisisPlanId: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

export interface CrisisStrategy {
  label: string;
  description: string;
  plan: CrisisPlan;
}

export interface CrisisFileAttachment {
  base64: string;
  mediaType:
    | "image/png"
    | "image/jpeg"
    | "image/webp"
    | "image/gif"
    | "application/pdf";
  name: string;
}

// ============================================================
// Crisis Detection Types
// ============================================================
export type CrisisDetectionTier = "off" | "watch" | "nudge" | "auto_triage";

export interface CrisisDetectionResult {
  detected: boolean;
  crisisRatio: number;
  availableMinutes: number;
  requiredMinutes: number;
  involvedTaskIds: string[];
  involvedTaskNames: string[];
  firstDeadline: Date;
}

export interface CrisisDetectionStatus {
  active: boolean;
  detectionId?: string;
  crisisRatio?: number;
  involvedTaskNames?: string[];
  firstDeadline?: string;
  availableMinutes?: number;
  requiredMinutes?: number;
  crisisPlanId?: string | null;
  stale?: boolean;
}

// ============================================================
// Medication Types
// ============================================================
export type MedicationSchedule =
  | { type: "daily" }
  | { type: "interval"; everyDays: number; startDate: string }
  | { type: "weekly"; daysOfWeek: number[] };

export interface Medication {
  id: string;
  name: string;
  dosage: string;
  notes: string | null;
  reminderTimes: string[]; // ["09:00", "21:00"]
  schedule: MedicationSchedule;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MedicationLog {
  id: string;
  medicationId: string;
  scheduledDate: string; // "2026-04-14"
  scheduledTime: string; // "09:00"
  takenAt: string;
}

// ============================================================
// Friend & Nudge Types
// ============================================================
export type FriendshipStatus = "pending" | "accepted" | "declined";

export interface FriendWithProfile {
  friendshipId: string;
  friendId: string;
  displayName: string | null;
  email: string;
}

export interface PendingRequest {
  friendshipId: string;
  requesterId: string;
  displayName: string | null;
  email: string;
  createdAt: string;
}

export interface Nudge {
  id: string;
  senderId: string;
  recipientId: string;
  category: TaskCategory;
  message: string;
  sentAt: string;
  senderDisplayName?: string;
}
