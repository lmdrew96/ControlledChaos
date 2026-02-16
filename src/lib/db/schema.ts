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
  savedLocations: jsonb("saved_locations"), // Array of {name, lat, lng, radius}
  notificationPrefs: jsonb("notification_prefs"), // Push/email toggles, quiet hours
  canvasIcalUrl: text("canvas_ical_url"),
  googleCalConnected: boolean("google_cal_connected").default(false),
  googleCalendarIds: jsonb("google_calendar_ids").$type<string[]>(), // selected calendar IDs to sync, null = all
  onboardingComplete: boolean("onboarding_complete").default(false),
  wakeTime: integer("wake_time").default(7), // Hour 0-23 when the day starts (default 7am)
  sleepTime: integer("sleep_time").default(22), // Hour 0-23 when the day ends (default 10pm)
  weekStartDay: integer("week_start_day").default(1), // 0=Sunday, 1=Monday
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
// Calendar Events (unified from Canvas + Google)
// ============================================================
export const calendarEvents = pgTable(
  "calendar_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .references(() => users.id)
      .notNull(),
    source: text("source").notNull(), // canvas, google, controlledchaos
    externalId: text("external_id"),
    title: text("title").notNull(),
    description: text("description"),
    startTime: timestamp("start_time").notNull(),
    endTime: timestamp("end_time").notNull(),
    location: text("location"),
    isAllDay: boolean("is_all_day").default(false),
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
      .references(() => tasks.id)
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
