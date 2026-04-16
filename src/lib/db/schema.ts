import {
  pgTable,
  text,
  timestamp,
  uuid,
  jsonb,
  boolean,
  integer,
  decimal,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// ============================================================
// Users (synced from Clerk)
// ============================================================
export const users = pgTable("users", {
  id: text("id").primaryKey(), // Clerk user ID
  email: text("email").notNull(),
  displayName: text("display_name"),
  timezone: text("timezone").default("America/New_York"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ============================================================
// User Settings & Preferences
// ============================================================
export const userSettings = pgTable("user_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .references(() => users.id)
    .notNull(),
  energyProfile: jsonb("energy_profile"), // Typical energy patterns by time of day
  savedLocations: jsonb("saved_locations"), // Array of {name, lat, lng, radius} — legacy, kept for safety
  notificationPrefs: jsonb("notification_prefs"), // Push/email toggles, quiet hours
  personalityPrefs: jsonb("personality_prefs"), // AI personality: {supportive, formality, language} each 0|1|2
  canvasIcalUrl: text("canvas_ical_url"),
  onboardingComplete: boolean("onboarding_complete").default(false),
  wakeTime: integer("wake_time").default(7), // Hour 0-23 — AI scheduling window start (default 7am)
  sleepTime: integer("sleep_time").default(22), // Hour 0-23 — AI scheduling window end (default 10pm)
  calendarStartHour: integer("calendar_start_hour").default(7), // Hour 0-23 — calendar display start (default 7am)
  calendarEndHour: integer("calendar_end_hour").default(22), // Hour 0-23 — calendar display end (default 10pm)
  weekStartDay: integer("week_start_day").default(1), // 0=Sunday, 1=Monday
  calendarExportToken: text("calendar_export_token"), // UUID for personal iCal subscribe URL
  calendarColors: jsonb("calendar_colors"), // {canvas: "blue", controlledchaos: "purple"} — event color per source
  crisisDetectionTier: text("crisis_detection_tier").default("nudge"), // "off" | "watch" | "nudge" | "auto_triage"
});

// ============================================================
// Goals
// ============================================================
export const goals = pgTable("goals", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .references(() => users.id)
    .notNull(),
  title: text("title").notNull(),
  description: text("description"),
  targetDate: timestamp("target_date"),
  status: text("status").default("active").notNull(), // active, completed, paused
  deletedAt: timestamp("deleted_at"), // soft delete — null = active, set = deleted
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ============================================================
// Brain Dumps (raw input before parsing)
// ============================================================
export const brainDumps = pgTable(
  "brain_dumps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .references(() => users.id)
      .notNull(),
    inputType: text("input_type").notNull(), // text, voice, photo
    rawContent: text("raw_content"),
    mediaUrl: text("media_url"), // R2 URL for audio/photo
    category: text("category").default("braindump").notNull(), // braindump | junk_journal
    parsed: boolean("parsed").default(false),
    aiResponse: jsonb("ai_response"), // Full AI parsing response
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_brain_dumps_user").on(table.userId, table.createdAt),
  ]
);

// ============================================================
// Tasks (the core entity)
// ============================================================
export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .references(() => users.id)
      .notNull(),
    title: text("title").notNull(),
    description: text("description"),
    status: text("status").default("pending").notNull(), // pending, in_progress, completed, snoozed, cancelled
    priority: text("priority").default("normal").notNull(), // urgent, important, normal, someday
    energyLevel: text("energy_level").default("medium").notNull(), // low, medium, high
    estimatedMinutes: integer("estimated_minutes"),
    category: text("category"), // school, work, personal, errands, health
    locationTags: jsonb("location_tags").$type<string[]>(), // ["home", "campus"] — null or [] = anywhere
    deadline: timestamp("deadline"),
    scheduledFor: timestamp("scheduled_for"),
    completedAt: timestamp("completed_at"),
    parentTaskId: uuid("parent_task_id"),
    sourceDumpId: uuid("source_dump_id").references(() => brainDumps.id),
    goalId: uuid("goal_id").references(() => goals.id),
    sortOrder: integer("sort_order"),
    progressSteps: jsonb("progress_steps"), // ProgressStep[] — inline step-through for long tasks
    currentStepIndex: integer("current_step_index").default(0),
    snoozedUntil: timestamp("snoozed_until"), // set by Haiku snooze — task hidden until this time
    deletedAt: timestamp("deleted_at"), // soft delete — null = active, set = deleted
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_tasks_user_status").on(table.userId, table.status),
    index("idx_tasks_user_deadline").on(table.userId, table.deadline),
    index("idx_tasks_user_scheduled").on(table.userId, table.scheduledFor),
  ]
);

// ============================================================
// Calendar Events (Canvas iCal + ControlledChaos-created)
// ============================================================
export const calendarEvents = pgTable(
  "calendar_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .references(() => users.id)
      .notNull(),
    source: text("source").notNull(), // canvas, controlledchaos
    externalId: text("external_id"),
    title: text("title").notNull(),
    description: text("description"),
    startTime: timestamp("start_time").notNull(),
    endTime: timestamp("end_time").notNull(),
    location: text("location"),
    isAllDay: boolean("is_all_day").default(false),
    category: text("category"), // school, work, personal, errands, health
    seriesId: text("series_id"), // UUID linking recurring event instances
    sourceDumpId: uuid("source_dump_id").references(() => brainDumps.id),
    syncedAt: timestamp("synced_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_calendar_events_user_time").on(table.userId, table.startTime),
    uniqueIndex("idx_calendar_events_unique_external").on(
      table.userId,
      table.source,
      table.externalId
    ),
  ]
);

// ============================================================
// Saved Locations
// ============================================================
export const locations = pgTable("locations", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .references(() => users.id)
    .notNull(),
  name: text("name").notNull(),
  latitude: decimal("latitude", { precision: 10, scale: 8 }),
  longitude: decimal("longitude", { precision: 11, scale: 8 }),
  radiusMeters: integer("radius_meters").default(200),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ============================================================
// Commute Times (travel minutes between saved locations)
// ============================================================
export const commuteTimes = pgTable(
  "commute_times",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .references(() => users.id)
      .notNull(),
    fromLocationId: uuid("from_location_id")
      .references(() => locations.id, { onDelete: "cascade" })
      .notNull(),
    toLocationId: uuid("to_location_id")
      .references(() => locations.id, { onDelete: "cascade" })
      .notNull(),
    travelMode: text("travel_mode").notNull().default("driving"),
    travelMinutes: integer("travel_minutes").notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("idx_commute_pair_mode").on(
      table.fromLocationId,
      table.toLocationId,
      table.travelMode
    ),
  ]
);

// ============================================================
// User Locations (last known position for geofence notifications)
// ============================================================
export const userLocations = pgTable("user_locations", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .references(() => users.id)
    .notNull()
    .unique(),
  latitude: decimal("latitude", { precision: 10, scale: 8 }).notNull(),
  longitude: decimal("longitude", { precision: 11, scale: 8 }).notNull(),
  matchedLocationId: uuid("matched_location_id").references(() => locations.id),
  matchedLocationName: text("matched_location_name"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ============================================================
// Location Notification Log (dedup for geofence triggers)
// ============================================================
export const locationNotificationLog = pgTable(
  "location_notification_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .references(() => users.id)
      .notNull(),
    locationId: uuid("location_id")
      .references(() => locations.id)
      .notNull(),
    taskId: uuid("task_id").references(() => tasks.id, { onDelete: "cascade" }),
    event: text("event").notNull(), // "arrival" | "departure"
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_loc_notif_log_user_loc").on(
      table.userId,
      table.locationId,
      table.createdAt
    ),
  ]
);

// ============================================================
// Task Activity Log (for AI learning)
// ============================================================
export const taskActivity = pgTable(
  "task_activity",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .references(() => users.id)
      .notNull(),
    taskId: uuid("task_id")
      .references(() => tasks.id, { onDelete: "cascade" })
      .notNull(),
    action: text("action").notNull(), // recommended, accepted, snoozed, rejected, completed, skipped
    context: jsonb("context"), // {energy, location, time_of_day, time_available}
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_task_activity_user").on(table.userId, table.createdAt),
  ]
);

// ============================================================
// Notifications
// ============================================================
export const notifications = pgTable("notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .references(() => users.id)
    .notNull(),
  type: text("type").notNull(), // push, email_morning, email_evening
  content: jsonb("content"),
  sentAt: timestamp("sent_at"),
  openedAt: timestamp("opened_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ============================================================
// Crisis Plans
// ============================================================
export const crisisPlans = pgTable(
  "crisis_plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .references(() => users.id)
      .notNull(),
    taskName: text("task_name").notNull(),
    deadline: timestamp("deadline").notNull(),
    completionPct: integer("completion_pct").notNull(),
    panicLevel: text("panic_level").notNull(), // fine | tight | damage-control
    panicLabel: text("panic_label").notNull(),
    summary: text("summary").notNull(),
    tasks: jsonb("tasks").notNull(), // CrisisTask[]
    currentTaskIndex: integer("current_task_index").default(0).notNull(),
    completedAt: timestamp("completed_at"), // null = in-progress
    source: text("source").default("manual"), // "manual" | "auto" — how the plan was initiated
    dataHash: text("data_hash"), // hash of input data for auto-plans — staleness detection
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_crisis_plans_user").on(table.userId, table.createdAt),
  ]
);

// ============================================================
// Crisis Chat Messages
// ============================================================
export const crisisMessages = pgTable(
  "crisis_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    crisisPlanId: uuid("crisis_plan_id")
      .references(() => crisisPlans.id, { onDelete: "cascade" })
      .notNull(),
    userId: text("user_id")
      .references(() => users.id)
      .notNull(),
    role: text("role").notNull(), // "user" | "assistant"
    content: text("content").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_crisis_messages_plan").on(table.crisisPlanId, table.createdAt),
  ]
);

// ============================================================
// Crisis Detections (auto-detected deadline collisions)
// ============================================================
export const crisisDetections = pgTable(
  "crisis_detections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .references(() => users.id)
      .notNull(),
    crisisRatio: decimal("crisis_ratio", { precision: 5, scale: 3 }).notNull(),
    involvedTaskIds: jsonb("involved_task_ids").$type<string[]>().notNull(),
    involvedTaskNames: jsonb("involved_task_names").$type<string[]>().notNull(),
    firstDeadline: timestamp("first_deadline").notNull(),
    availableMinutes: integer("available_minutes").notNull(),
    requiredMinutes: integer("required_minutes").notNull(),
    tierActionTaken: text("tier_action_taken"), // "watch" | "nudge" | "auto_triage"
    crisisPlanId: uuid("crisis_plan_id").references(() => crisisPlans.id),
    reNudgeSent: boolean("re_nudge_sent").default(false),
    resolvedAt: timestamp("resolved_at"), // null = active
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_crisis_detections_user_active").on(table.userId, table.resolvedAt),
  ]
);

// ============================================================
// Push Subscriptions (one per device per user)
// ============================================================
export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .references(() => users.id)
      .notNull(),
    endpoint: text("endpoint").notNull(),
    keysP256dh: text("keys_p256dh").notNull(),
    keysAuth: text("keys_auth").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("idx_push_sub_user_endpoint").on(table.userId, table.endpoint),
  ]
);

// ============================================================
// Snoozed Pushes — re-queue a notification to fire later
// ============================================================
export const snoozedPushes = pgTable(
  "snoozed_pushes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .references(() => users.id)
      .notNull(),
    payload: jsonb("payload").notNull(), // { title, body, url, tag }
    sendAfter: timestamp("send_after").notNull(),
    sentAt: timestamp("sent_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_snoozed_pushes_pending").on(table.userId, table.sendAfter),
  ]
);

// ============================================================
// Medications
// ============================================================
export const medications = pgTable(
  "medications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .references(() => users.id)
      .notNull(),
    name: text("name").notNull(),
    dosage: text("dosage").notNull(),
    notes: text("notes"),
    reminderTimes: jsonb("reminder_times").$type<string[]>().notNull(), // ["09:00", "21:00"]
    schedule: jsonb("schedule").notNull(), // MedicationSchedule union
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_medications_user_active").on(table.userId, table.isActive),
  ]
);

// ============================================================
// Medication Logs (adherence tracking)
// ============================================================
export const medicationLogs = pgTable(
  "medication_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .references(() => users.id)
      .notNull(),
    medicationId: uuid("medication_id")
      .references(() => medications.id, { onDelete: "cascade" })
      .notNull(),
    scheduledDate: text("scheduled_date").notNull(), // "2026-04-14"
    scheduledTime: text("scheduled_time").notNull(), // "09:00"
    takenAt: timestamp("taken_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_med_logs_user_med_date").on(
      table.userId,
      table.medicationId,
      table.scheduledDate
    ),
    uniqueIndex("idx_med_logs_unique_slot").on(
      table.medicationId,
      table.scheduledDate,
      table.scheduledTime
    ),
  ]
);

// ============================================================
// Friendships (one row per pair: requester → addressee)
// ============================================================
export const friendships = pgTable(
  "friendships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requesterId: text("requester_id")
      .references(() => users.id)
      .notNull(),
    addresseeId: text("addressee_id")
      .references(() => users.id)
      .notNull(),
    status: text("status").default("pending").notNull(), // pending | accepted | declined
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_friendships_requester").on(table.requesterId),
    index("idx_friendships_addressee").on(table.addresseeId),
    uniqueIndex("idx_friendships_pair").on(
      table.requesterId,
      table.addresseeId
    ),
  ]
);

// ============================================================
// Nudges (friend-to-friend motivational messages by category)
// ============================================================
export const nudges = pgTable(
  "nudges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    senderId: text("sender_id")
      .references(() => users.id)
      .notNull(),
    recipientId: text("recipient_id")
      .references(() => users.id)
      .notNull(),
    category: text("category").notNull(), // school | work | personal | errands | health
    message: text("message").notNull(),
    sentAt: timestamp("sent_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_nudges_recipient").on(table.recipientId, table.sentAt),
  ]
);
