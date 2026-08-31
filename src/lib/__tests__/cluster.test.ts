import { describe, it, expect } from "vitest";
import {
  clusterAlerts,
  extractCourseCode,
  CLUSTER_WINDOW_MINUTES,
  type ClusterableAlert,
} from "@/lib/notifications/cluster";

const AT = new Date("2026-09-01T18:00:00Z"); // 2pm EDT
const mins = (n: number) => new Date(AT.getTime() + n * 60_000);

function alert(over: Partial<ClusterableAlert> & { dedupKey: string }): ClusterableAlert {
  return {
    kind: "deadline",
    at: AT,
    title: "Something",
    courseCode: null,
    ...over,
  };
}

describe("extractCourseCode", () => {
  it("reads the code out of a Canvas bracket tag", () => {
    expect(
      extractCourseCode("Long Live Latin [26S-LATN101-080]")
    ).toBe("LATN101");
    expect(
      extractCourseCode("QUIZ: Sonny's Blues [26S-ENGL204-510]")
    ).toBe("ENGL204");
  });

  it("reads a bare code from an auto-generated task description", () => {
    expect(
      extractCourseCode(null, "LATN101 · Due Mon, Sep 1, 2026, 11:59 PM")
    ).toBe("LATN101");
  });

  it("normalizes spacing and hyphens", () => {
    expect(extractCourseCode("LATN 101 Elementary Latin")).toBe("LATN101");
    expect(extractCourseCode("LATN-101 lecture")).toBe("LATN101");
  });

  it("falls through sources in order until one yields a code", () => {
    expect(extractCourseCode(null, undefined, "", "MATH221 homework")).toBe(
      "MATH221"
    );
  });

  it("prefers the bracket tag over an incidental match in the title", () => {
    expect(
      extractCourseCode("Read CHAP12 intro [26S-ANTH104-080]")
    ).toBe("ANTH104");
  });

  it("does not read lowercase prose as a course code", () => {
    expect(extractCourseCode("essay 2026 final draft")).toBeNull();
    expect(extractCourseCode("read chapter 12")).toBeNull();
  });

  it("returns null when there is nothing code-shaped", () => {
    expect(extractCourseCode("Long Live Latin")).toBeNull();
    expect(extractCourseCode(null, undefined)).toBeNull();
  });
});

describe("clusterAlerts — the LATN 101 lock-screen burst", () => {
  // The exact situation from the bug report: a class meeting and the homework
  // due at the start of it produced two separate pushes describing one hour.
  const homework = alert({
    kind: "deadline",
    dedupKey: "deadline-hw",
    title: "Long Live Latin",
    courseCode: "LATN101",
    at: AT,
  });
  const klass = alert({
    kind: "event",
    dedupKey: "event-latn101",
    title: "LATN101 Elementary Latin I",
    courseCode: "LATN101",
    at: AT,
  });

  it("collapses the class and its homework into one cluster", () => {
    const clusters = clusterAlerts([homework, klass]);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].dedupKeys).toEqual(["deadline-hw", "event-latn101"]);
  });

  it("lets the task speak, so the push keeps its deep link and buttons", () => {
    const [cluster] = clusterAlerts([homework, klass]);
    expect(cluster.primary.dedupKey).toBe("deadline-hw");
    expect(cluster.absorbed.map((a) => a.title)).toEqual([
      "LATN101 Elementary Latin I",
    ]);
  });

  it("picks the task as primary regardless of input order", () => {
    const [cluster] = clusterAlerts([klass, homework]);
    expect(cluster.primary.dedupKey).toBe("deadline-hw");
  });
});

describe("clusterAlerts — keeps unrelated things apart", () => {
  it("does NOT group on time proximity alone", () => {
    // A dentist appointment and an essay deadline in the same hour are two
    // situations. Blending them would cost more in predictability than it
    // saves in interruptions.
    const clusters = clusterAlerts([
      alert({ dedupKey: "essay", title: "Finish essay", at: AT }),
      alert({ kind: "event", dedupKey: "dentist", title: "Dentist", at: AT }),
    ]);
    expect(clusters).toHaveLength(2);
  });

  it("separates same-course alerts that are far apart in time", () => {
    const clusters = clusterAlerts([
      alert({ dedupKey: "a", courseCode: "LATN101", at: AT }),
      alert({
        kind: "event",
        dedupKey: "b",
        courseCode: "LATN101",
        at: mins(CLUSTER_WINDOW_MINUTES + 1),
      }),
    ]);
    expect(clusters).toHaveLength(2);
  });

  it("groups same-course alerts right at the window edge", () => {
    const clusters = clusterAlerts([
      alert({ dedupKey: "a", courseCode: "LATN101", at: AT }),
      alert({
        kind: "event",
        dedupKey: "b",
        courseCode: "LATN101",
        at: mins(CLUSTER_WINDOW_MINUTES),
      }),
    ]);
    expect(clusters).toHaveLength(1);
  });

  it("never groups two alerts that both lack a course code", () => {
    const clusters = clusterAlerts([
      alert({ dedupKey: "a", title: "Call mom" }),
      alert({ dedupKey: "b", title: "Buy milk" }),
    ]);
    expect(clusters).toHaveLength(2);
  });
});

describe("clusterAlerts — explicit event links", () => {
  it("groups a prep task with the assessment it was generated from", () => {
    // Prep tasks carry the quiz's Canvas UID in sourceEventId, so they link
    // to the quiz event even with no course code on either side.
    const uid = "event-quiz-90210@canvas.instructure.com";
    const clusters = clusterAlerts([
      alert({ dedupKey: "prep", title: "Prep: Unit 2", sourceEventId: uid }),
      alert({ kind: "event", dedupKey: "quiz", title: "QUIZ: Unit 2", externalId: uid }),
    ]);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].primary.dedupKey).toBe("prep");
  });

  it("does not link alerts whose external ids differ", () => {
    const clusters = clusterAlerts([
      alert({ dedupKey: "a", sourceEventId: "uid-1" }),
      alert({ kind: "event", dedupKey: "b", externalId: "uid-2" }),
    ]);
    expect(clusters).toHaveLength(2);
  });
});

describe("clusterAlerts — which alert leads", () => {
  it("lets a much sooner event lead over a later task", () => {
    // Kind preference must not bury something firing in 10 minutes behind a
    // task due two hours later.
    const [cluster] = clusterAlerts([
      alert({ dedupKey: "task-later", courseCode: "LATN101", at: mins(120) }),
      alert({ kind: "event", dedupKey: "class-now", courseCode: "LATN101", at: AT }),
    ]);
    expect(cluster.primary.dedupKey).toBe("class-now");
  });

  it("prefers the task when both describe the same moment", () => {
    const [cluster] = clusterAlerts([
      alert({ kind: "event", dedupKey: "class", courseCode: "LATN101", at: AT }),
      alert({ dedupKey: "hw", courseCode: "LATN101", at: mins(20) }),
    ]);
    expect(cluster.primary.dedupKey).toBe("hw");
  });

  it("still prefers the task when it is the earlier of the two", () => {
    const [cluster] = clusterAlerts([
      alert({ kind: "event", dedupKey: "class", courseCode: "LATN101", at: mins(20) }),
      alert({ dedupKey: "hw", courseCode: "LATN101", at: AT }),
    ]);
    expect(cluster.primary.dedupKey).toBe("hw");
  });
});

describe("clusterAlerts — structural guarantees", () => {
  it("returns every alert exactly once across all clusters", () => {
    const input = [
      alert({ dedupKey: "a", courseCode: "LATN101" }),
      alert({ kind: "event", dedupKey: "b", courseCode: "LATN101" }),
      alert({ dedupKey: "c", courseCode: "MATH221" }),
      alert({ dedupKey: "d", title: "Unrelated" }),
    ];
    const keys = clusterAlerts(input).flatMap((c) => c.dedupKeys);
    expect(keys.sort()).toEqual(["a", "b", "c", "d"]);
  });

  it("merges groups bridged by a later alert (transitivity)", () => {
    // `bridge` shares an event link with `a` and a course code with `c`,
    // so all three are one situation even though a and c share no signal.
    const clusters = clusterAlerts([
      alert({ dedupKey: "a", sourceEventId: "uid-1" }),
      alert({ dedupKey: "c", courseCode: "LATN101" }),
      alert({
        kind: "event",
        dedupKey: "bridge",
        externalId: "uid-1",
        courseCode: "LATN101",
      }),
    ]);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].dedupKeys.sort()).toEqual(["a", "bridge", "c"]);
  });

  it("gives a lone alert a single-member cluster", () => {
    const clusters = clusterAlerts([alert({ dedupKey: "solo" })]);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].absorbed).toEqual([]);
    expect(clusters[0].primary.dedupKey).toBe("solo");
  });

  it("handles an empty input", () => {
    expect(clusterAlerts([])).toEqual([]);
  });

  it("preserves the caller's urgency ordering across clusters", () => {
    const clusters = clusterAlerts([
      alert({ dedupKey: "soonest", at: AT }),
      alert({ dedupKey: "later", at: mins(300) }),
    ]);
    expect(clusters.map((c) => c.primary.dedupKey)).toEqual([
      "soonest",
      "later",
    ]);
  });
});
