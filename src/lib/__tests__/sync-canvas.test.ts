import { describe, it, expect } from "vitest";
import {
  toEndOfDayLocal,
  isAssignmentEvent,
  classifyCanvasEvent,
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
