import { describe, it, expect } from "vitest";
import { attachAssessmentsToClasses, courseKey } from "@/lib/calendar/attach-assessments";

const ev = (id: string, source: string, title: string, start: string, end: string) => ({
  id,
  source,
  title,
  startTime: `2026-09-24T${start}:00Z`,
  endTime: `2026-09-24T${end}:00Z`,
  isAllDay: false,
});

describe("courseKey", () => {
  it("normalizes spaced and tagged course codes alike", () => {
    expect(courseKey("LATN 101 - Elementary Latin I")).toBe("LATN101");
    expect(courseKey("QUIZ: Chapter 3 [26F-LATN101-010]")).toBe("LATN101");
  });
});

describe("attachAssessmentsToClasses", () => {
  const cls = ev("c", "controlledchaos", "LATN 101 - Elementary Latin I", "17:50", "18:40");

  it("folds a same-course quiz during class into the class tile", () => {
    const quiz = ev("q", "canvas", "QUIZ: Chapter 3 [26F-LATN101-010]", "17:50", "17:50");
    const { visible, attached } = attachAssessmentsToClasses([cls, quiz]);
    expect(visible.map((e) => e.id)).toEqual(["c"]);
    expect(attached.get("c")?.[0]).toMatchObject({ label: "📝 Quiz" });
  });

  it("leaves a quiz for a different course alone", () => {
    const quiz = ev("q", "canvas", "QUIZ: Cells [26F-BIOL101-010]", "17:50", "17:50");
    expect(attachAssessmentsToClasses([cls, quiz]).visible).toHaveLength(2);
  });

  it("leaves a quiz outside class time alone", () => {
    const quiz = ev("q", "canvas", "QUIZ: Chapter 3 [26F-LATN101-010]", "23:59", "23:59");
    expect(attachAssessmentsToClasses([cls, quiz]).visible).toHaveLength(2);
  });

  it("never attaches a homework due date", () => {
    const hw = ev("h", "canvas", "Long Live Latin [26F-LATN101-010]", "17:50", "17:50");
    expect(attachAssessmentsToClasses([cls, hw]).visible).toHaveLength(2);
  });
});
