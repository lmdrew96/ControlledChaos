import { describe, it, expect } from "vitest";
import {
  getTaskTimes,
  getSoonestTaskTime,
  compareBySoonestTime,
} from "@/lib/tasks/task-times";

const T = (iso: string) => new Date(iso).getTime();

describe("getSoonestTaskTime", () => {
  it("returns null when a task carries none of the three times", () => {
    expect(getSoonestTaskTime({})).toBeNull();
    expect(
      getSoonestTaskTime({ deadline: null, targetDate: null, scheduledFor: null })
    ).toBeNull();
  });

  it("picks the soft target when it lands before the hard deadline", () => {
    const soonest = getSoonestTaskTime({
      deadline: "2026-09-10T12:00:00.000Z",
      targetDate: "2026-09-08T12:00:00.000Z",
    });
    expect(soonest?.kind).toBe("target");
    expect(soonest?.at.getTime()).toBe(T("2026-09-08T12:00:00.000Z"));
  });

  it("picks the planned start when it is the earliest of all three", () => {
    const soonest = getSoonestTaskTime({
      deadline: "2026-09-10T12:00:00.000Z",
      targetDate: "2026-09-08T12:00:00.000Z",
      scheduledFor: "2026-09-02T09:00:00.000Z",
    });
    expect(soonest?.kind).toBe("planned");
  });

  it("still reports the deadline when it is the only time set", () => {
    const soonest = getSoonestTaskTime({ deadline: "2026-09-10T12:00:00.000Z" });
    expect(soonest?.kind).toBe("deadline");
  });

  it("breaks exact ties toward the harder commitment", () => {
    const at = "2026-09-10T12:00:00.000Z";
    expect(getSoonestTaskTime({ targetDate: at, scheduledFor: at })?.kind).toBe("target");
    expect(getSoonestTaskTime({ deadline: at, targetDate: at })?.kind).toBe("deadline");
  });

  it("accepts Date objects as well as ISO strings", () => {
    const soonest = getSoonestTaskTime({ deadline: new Date("2026-09-10T12:00:00.000Z") });
    expect(soonest?.at.getTime()).toBe(T("2026-09-10T12:00:00.000Z"));
  });

  it("ignores unparseable values rather than returning an Invalid Date", () => {
    expect(getSoonestTaskTime({ deadline: "not a date" })).toBeNull();
    expect(getSoonestTaskTime({ deadline: "nope", targetDate: "2026-09-08T12:00:00.000Z" })?.kind)
      .toBe("target");
  });
});

describe("getTaskTimes", () => {
  it("returns every time a task carries, soonest first", () => {
    const times = getTaskTimes({
      deadline: "2026-09-10T12:00:00.000Z",
      targetDate: "2026-09-08T12:00:00.000Z",
      scheduledFor: "2026-09-09T09:00:00.000Z",
    });
    expect(times.map((t) => t.kind)).toEqual(["target", "planned", "deadline"]);
  });
});

describe("compareBySoonestTime", () => {
  it("sorts a soft target ahead of a later hard deadline", () => {
    const target = { targetDate: "2026-09-08T12:00:00.000Z" };
    const deadline = { deadline: "2026-09-10T12:00:00.000Z" };
    expect([deadline, target].sort(compareBySoonestTime)[0]).toBe(target);
  });

  it("sorts a planned start ahead of a later deadline on the same task list", () => {
    const planned = { scheduledFor: "2026-09-02T09:00:00.000Z" };
    const deadline = { deadline: "2026-09-03T09:00:00.000Z" };
    expect([deadline, planned].sort(compareBySoonestTime)[0]).toBe(planned);
  });

  it("puts tasks with no times at all last", () => {
    const none = {};
    const dated = { deadline: "2026-09-10T12:00:00.000Z" };
    expect([none, dated].sort(compareBySoonestTime)).toEqual([dated, none]);
  });

  it("treats two timeless tasks as equal", () => {
    expect(compareBySoonestTime({}, {})).toBe(0);
  });
});
