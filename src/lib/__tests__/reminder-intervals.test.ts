import { describe, it, expect } from "vitest";
import { getReminderIntervals } from "@/lib/notifications/reminder-intervals";
import {
  DEFAULT_DEADLINE_REMINDER_INTERVALS,
  DEFAULT_EVENT_REMINDER_INTERVALS,
  type NotificationPrefs,
} from "@/types";

/** Only the fields resolution reads matter; the rest are irrelevant here. */
function prefs(over: Partial<NotificationPrefs>): NotificationPrefs {
  return over as NotificationPrefs;
}

describe("getReminderIntervals — kind-specific settings", () => {
  it("uses each kind's own list when both are set", () => {
    const p = prefs({
      deadlineReminderIntervals: [1440, 60],
      eventReminderIntervals: [10],
    });
    expect(getReminderIntervals(p, "deadline")).toEqual([1440, 60]);
    expect(getReminderIntervals(p, "event")).toEqual([10]);
  });

  it("lets one kind be turned off without touching the other", () => {
    // The whole point of the split: quiet event reminders, keep deadlines.
    const p = prefs({
      deadlineReminderIntervals: [1440, 60, 10],
      eventReminderIntervals: [],
    });
    expect(getReminderIntervals(p, "deadline")).toEqual([1440, 60, 10]);
    expect(getReminderIntervals(p, "event")).toEqual([]);
  });

  it("falls back per-kind, so setting one leaves the other on its default", () => {
    const p = prefs({ eventReminderIntervals: [15] });
    expect(getReminderIntervals(p, "event")).toEqual([15]);
    expect(getReminderIntervals(p, "deadline")).toEqual(
      DEFAULT_DEADLINE_REMINDER_INTERVALS
    );
  });
});

describe("getReminderIntervals — accounts saved before the split", () => {
  it("applies a legacy custom schedule to both kinds", () => {
    // Nobody's existing setup may change just because the field was split.
    const p = prefs({ reminderIntervals: [120, 30] });
    expect(getReminderIntervals(p, "deadline")).toEqual([120, 30]);
    expect(getReminderIntervals(p, "event")).toEqual([120, 30]);
  });

  it("preserves a legacy opt-out for both kinds", () => {
    const p = prefs({ reminderIntervals: [] });
    expect(getReminderIntervals(p, "deadline")).toEqual([]);
    expect(getReminderIntervals(p, "event")).toEqual([]);
  });

  it("lets a kind-specific list override the legacy value", () => {
    const p = prefs({
      reminderIntervals: [120, 30],
      eventReminderIntervals: [5],
    });
    expect(getReminderIntervals(p, "event")).toEqual([5]);
    expect(getReminderIntervals(p, "deadline")).toEqual([120, 30]);
  });

  it("lets a kind-specific opt-out override a legacy schedule", () => {
    // [] must not fall through to the legacy list — it means "off".
    const p = prefs({
      reminderIntervals: [1440, 60, 10],
      eventReminderIntervals: [],
    });
    expect(getReminderIntervals(p, "event")).toEqual([]);
    expect(getReminderIntervals(p, "deadline")).toEqual([1440, 60, 10]);
  });
});

describe("getReminderIntervals — defaults and normalization", () => {
  it("defaults each kind when nothing is configured", () => {
    for (const p of [null, undefined, prefs({})]) {
      expect(getReminderIntervals(p, "deadline")).toEqual(
        DEFAULT_DEADLINE_REMINDER_INTERVALS
      );
      expect(getReminderIntervals(p, "event")).toEqual(
        DEFAULT_EVENT_REMINDER_INTERVALS
      );
    }
  });

  it("starts both kinds identical, so the split changes no behavior", () => {
    expect(DEFAULT_EVENT_REMINDER_INTERVALS).toEqual(
      DEFAULT_DEADLINE_REMINDER_INTERVALS
    );
  });

  it("sorts descending, dedupes, and drops junk values", () => {
    const p = prefs({
      deadlineReminderIntervals: [60, 1440, 60, -5, 0, 10.7, NaN],
    });
    expect(getReminderIntervals(p, "deadline")).toEqual([1440, 60, 10]);
  });
});
