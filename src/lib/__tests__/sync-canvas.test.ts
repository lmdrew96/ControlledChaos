import { describe, it, expect } from "vitest";
import {
  toEndOfDayLocal,
  isAssignmentEvent,
  classifyCanvasEvent,
  isEndOfDayDeadline,
  shouldSyncAsCalendarEvent,
} from "@/lib/calendar/canvas-helpers";

describe("toEndOfDayLocal — Canvas all-day assignment regression", () => {
  // node-ical parses VALUE=DATE entries to midnight UTC of that calendar day.
  // For an assignment "due May 9" we must build May 9 23:59 in the user's tz,
  // NOT May 8 23:59 (which is what reading parts in NY tz would produce, since
  // 2026-05-09T00:00:00Z is May 8 8pm EDT).

  it("EDT: May 9 all-day → May 9 23:59 EDT (03:59 UTC May 10)", () => {
    const allDay = new Date("2026-05-09T00:00:00Z");
    const result = toEndOfDayLocal(allDay, "America/New_York");
    expect(result.toISOString()).toBe("2026-05-10T03:59:00.000Z");
  });

  it("EST (winter): Jan 15 all-day → Jan 15 23:59 EST (04:59 UTC Jan 16)", () => {
    const allDay = new Date("2026-01-15T00:00:00Z");
    const result = toEndOfDayLocal(allDay, "America/New_York");
    expect(result.toISOString()).toBe("2026-01-16T04:59:00.000Z");
  });

  it("PT: Mar 1 all-day → Mar 1 23:59 PST (07:59 UTC Mar 2)", () => {
    const allDay = new Date("2026-03-01T00:00:00Z");
    const result = toEndOfDayLocal(allDay, "America/Los_Angeles");
    expect(result.toISOString()).toBe("2026-03-02T07:59:00.000Z");
  });

  it("does not shift the calendar day backwards in westward timezones", () => {
    const allDay = new Date("2026-05-09T00:00:00Z");
    const result = toEndOfDayLocal(allDay, "America/New_York");
    const day = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      day: "2-digit",
    }).format(result);
    expect(day).toBe("09");
  });
});

describe("classifyCanvasEvent — homework must become a task, not just an event", () => {
  // The regression this covers: classification used to run on title keywords
  // only (QUIZ/EXAM/TEST/DUE/ASSIGNMENT), so homework whose title carries no
  // keyword synced as a calendar event and never produced a task.
  const HW_UID = "event-assignment-90210@canvas.instructure.com";
  const QUIZ_UID = "event-quiz-90210@canvas.instructure.com";
  const DISCUSSION_UID = "event-discussion_topic-90210@canvas.instructure.com";
  const PLAIN_UID = "event-calendar-event-90210@canvas.instructure.com";

  it("classifies keyword-less homework as an assignment via its UID", () => {
    expect(
      classifyCanvasEvent(HW_UID, "Reading Response 3 [26S-ENGL204-510]")
    ).toBe("assignment");
    expect(
      classifyCanvasEvent(HW_UID, "Problem Set 4 [26S-MATH221-010]")
    ).toBe("assignment");
  });

  it("classifies graded discussions as assignments", () => {
    expect(
      classifyCanvasEvent(DISCUSSION_UID, "Week 3 Discussion [26S-ANTH104-080]")
    ).toBe("assignment");
  });

  it("classifies quizzes and exams as assessments", () => {
    expect(classifyCanvasEvent(QUIZ_UID, "Unit 2 [26S-ENGL204-510]")).toBe(
      "assessment"
    );
    expect(
      classifyCanvasEvent(HW_UID, "QUIZ: Sonny's Blues [26S-ENGL204-510]")
    ).toBe("assessment");
    expect(
      classifyCanvasEvent(HW_UID, "Midterm Exam [26S-MATH221-010]")
    ).toBe("assessment");
  });

  it("returns null for non-coursework calendar entries", () => {
    expect(
      classifyCanvasEvent(PLAIN_UID, "ENGL204 Lecture [26S-ENGL204-510]")
    ).toBeNull();
    expect(classifyCanvasEvent(PLAIN_UID, "Office Hours")).toBeNull();
    expect(classifyCanvasEvent(PLAIN_UID, "Spring Break — No Class")).toBeNull();
  });

  it("falls back to title keywords when the UID has no Canvas object type", () => {
    expect(classifyCanvasEvent("abc123@example.com", "Essay 2 due")).toBe(
      "assignment"
    );
    expect(classifyCanvasEvent("abc123@example.com", "Final Exam")).toBe(
      "assessment"
    );
  });

  it("does not read 'test' inside another word as an assessment", () => {
    // "Latest"/"Contest" contain "test" — substring matching used to be the
    // failure mode here, so these must classify on the UID, not the title.
    expect(
      classifyCanvasEvent(HW_UID, "Latest Draft [26S-ENGL204-510]")
    ).toBe("assignment");
    expect(classifyCanvasEvent(PLAIN_UID, "Contest Info Session")).toBeNull();
  });
});

describe("isAssignmentEvent", () => {
  it("matches Canvas coursework UIDs", () => {
    expect(isAssignmentEvent("event-assignment-1@canvas.instructure.com")).toBe(
      true
    );
    expect(isAssignmentEvent("event-quiz-1@canvas.instructure.com")).toBe(true);
    expect(
      isAssignmentEvent("event-discussion_topic-1@canvas.instructure.com")
    ).toBe(true);
  });

  it("does not match plain calendar entries", () => {
    expect(
      isAssignmentEvent("event-calendar-event-1@canvas.instructure.com")
    ).toBe(false);
  });
});

describe("shouldSyncAsCalendarEvent — assignments are tasks only", () => {
  const HW_UID = "event-assignment-90210@canvas.instructure.com";
  const QUIZ_UID = "event-quiz-90210@canvas.instructure.com";
  const DISCUSSION_UID = "event-discussion_topic-90210@canvas.instructure.com";
  const PLAIN_UID = "event-calendar-event-90210@canvas.instructure.com";

  it("keeps assignments and homework off the calendar entirely", () => {
    expect(shouldSyncAsCalendarEvent("assignment")).toBe(false);
  });

  it("keeps assessments on the calendar (they have a real time slot)", () => {
    expect(shouldSyncAsCalendarEvent("assessment")).toBe(true);
  });

  it("keeps non-coursework entries on the calendar", () => {
    expect(shouldSyncAsCalendarEvent(null)).toBe(true);
  });

  it("end-to-end: homework titles never reach the calendar", () => {
    const homework = [
      [HW_UID, "Reading Response 3 [26S-ENGL204-510]"],
      [HW_UID, "Problem Set 4 [26S-MATH221-010]"],
      [HW_UID, "Second Creative Response Project Assignment [26S-ENGL204-510]"],
      [DISCUSSION_UID, "Week 3 Discussion [26S-ANTH104-080]"],
      ["abc123@example.com", "Essay 2 due"],
      ["abc123@example.com", "Chapter 7 homework"],
    ] as const;
    for (const [uid, title] of homework) {
      const kind = classifyCanvasEvent(uid, title);
      expect(kind).toBe("assignment");
      expect(shouldSyncAsCalendarEvent(kind)).toBe(false);
    }
  });

  it("end-to-end: quizzes, tests and exams stay events (and get prep tasks)", () => {
    const assessments = [
      [QUIZ_UID, "Unit 2 [26S-ENGL204-510]"],
      [HW_UID, "QUIZ: Sonny's Blues [26S-ENGL204-510]"],
      [HW_UID, "Midterm Exam [26S-MATH221-010]"],
      ["abc123@example.com", "Final Exam"],
    ] as const;
    for (const [uid, title] of assessments) {
      const kind = classifyCanvasEvent(uid, title);
      expect(kind).toBe("assessment");
      expect(shouldSyncAsCalendarEvent(kind)).toBe(true);
    }
  });

  it("end-to-end: class meetings and office hours stay events with no task", () => {
    for (const title of ["ENGL204 Lecture [26S-ENGL204-510]", "Office Hours"]) {
      const kind = classifyCanvasEvent(PLAIN_UID, title);
      expect(kind).toBeNull();
      expect(shouldSyncAsCalendarEvent(kind)).toBe(true);
    }
  });
});

describe("isEndOfDayDeadline — 11:59 PM is a due time, not an appointment", () => {
  const ET = "America/New_York";

  it("is true at 11:59 PM local", () => {
    // 2026-09-15 23:59 EDT = 2026-09-16 03:59 UTC
    expect(isEndOfDayDeadline(new Date("2026-09-16T03:59:00Z"), ET)).toBe(true);
  });

  it("is true for the :55–:58 rounding window", () => {
    expect(isEndOfDayDeadline(new Date("2026-09-16T03:55:00Z"), ET)).toBe(true);
    expect(isEndOfDayDeadline(new Date("2026-09-16T03:58:00Z"), ET)).toBe(true);
  });

  it("is false earlier in the 11 PM hour", () => {
    expect(isEndOfDayDeadline(new Date("2026-09-16T03:00:00Z"), ET)).toBe(false);
    expect(isEndOfDayDeadline(new Date("2026-09-16T03:54:00Z"), ET)).toBe(false);
  });

  it("is false for a real sit-down exam slot", () => {
    // 2026-09-15 10:00 EDT — a room you show up to
    expect(isEndOfDayDeadline(new Date("2026-09-15T14:00:00Z"), ET)).toBe(false);
  });

  it("is false at midnight, the first minute of the NEXT day", () => {
    expect(isEndOfDayDeadline(new Date("2026-09-16T04:00:00Z"), ET)).toBe(false);
  });

  it("reads the wall clock in the user's timezone, not UTC", () => {
    // Same instant: 11:59 PM Pacific, but 2:59 AM Eastern the next day.
    const instant = new Date("2026-09-16T06:59:00Z");
    expect(isEndOfDayDeadline(instant, "America/Los_Angeles")).toBe(true);
    expect(isEndOfDayDeadline(instant, ET)).toBe(false);
  });

  it("agrees with toEndOfDayLocal, which is what produces these times", () => {
    const allDay = new Date("2026-09-15T00:00:00Z");
    for (const tz of [ET, "America/Los_Angeles", "America/Chicago"]) {
      expect(isEndOfDayDeadline(toEndOfDayLocal(allDay, tz), tz)).toBe(true);
    }
  });
});
