import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { detectCrisis, type CrisisDetectionInput } from "../crisis-detection";

// Same pinned clock as crisis-moments.test.ts: a weekday mid-morning, so the
// windows under test stay inside waking hours regardless of when this runs.
const FIXED_NOW = new Date("2026-04-15T14:00:00.000Z"); // 10 AM EDT

beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
});
afterAll(() => {
  vi.useRealTimers();
});

const hoursAhead = (hrs: number) => new Date(Date.now() + hrs * 60 * 60 * 1000);

function input(overrides: Partial<CrisisDetectionInput> = {}): CrisisDetectionInput {
  return {
    tasks: [],
    calendarEvents: [],
    timezone: "America/New_York",
    wakeTime: 7,
    sleepTime: 22,
    detectionWindowHours: 48,
    ...overrides,
  };
}

/**
 * Two target-only tasks converging in ~3 hours.
 * 170 min of work against ~180 min available ≈ 0.94 — above the 0.8 drift line.
 */
function driftingTargets() {
  return [
    {
      id: "t1",
      title: "Outline the essay",
      deadline: null,
      targetDate: hoursAhead(2),
      estimatedMinutes: 85,
      status: "pending",
    },
    {
      id: "t2",
      title: "Read chapter 4",
      deadline: null,
      targetDate: hoursAhead(3),
      estimatedMinutes: 85,
      status: "pending",
    },
  ];
}

describe("drift tier — falling behind your own targets", () => {
  it("reports drift, not crisis, for target-only overload", () => {
    const result = detectCrisis(input({ tasks: driftingTargets() }));
    expect(result?.severity).toBe("drift");
    expect(result?.involvedTaskNames).toContain("Outline the essay");
  });

  it("stays silent when the targets comfortably fit", () => {
    const roomy = driftingTargets().map((t) => ({ ...t, estimatedMinutes: 10 }));
    expect(detectCrisis(input({ tasks: roomy }))).toBeNull();
  });

  it("ignores a task whose target is outside the detection window", () => {
    const faraway = driftingTargets().map((t) => ({ ...t, targetDate: hoursAhead(200) }));
    expect(detectCrisis(input({ tasks: faraway }))).toBeNull();
  });

  it("requires two converging targets — one tight target is just a plan", () => {
    const single = [driftingTargets()[0]];
    expect(detectCrisis(input({ tasks: single }))).toBeNull();
  });

  it("ignores targets on tasks that are already done", () => {
    const done = driftingTargets().map((t) => ({ ...t, status: "completed" }));
    expect(detectCrisis(input({ tasks: done }))).toBeNull();
  });
});

describe("drift never masks or mimics a real crisis", () => {
  it("a hard deadline overload still reports severity 'crisis'", () => {
    const result = detectCrisis(
      input({
        tasks: [
          {
            id: "h1",
            title: "Midterm paper",
            deadline: hoursAhead(2),
            targetDate: hoursAhead(1),
            estimatedMinutes: 400,
            status: "pending",
          },
        ],
      })
    );
    expect(result?.severity).toBe("crisis");
  });

  it("hard-tier behaviour is unchanged by tasks that only carry targets", () => {
    const hardOnly = [
      {
        id: "h1",
        title: "Midterm paper",
        deadline: hoursAhead(2),
        estimatedMinutes: 400,
        status: "pending",
      },
    ];
    const withTargets = [...hardOnly, ...driftingTargets()];

    const a = detectCrisis(input({ tasks: hardOnly }));
    const b = detectCrisis(input({ tasks: withTargets }));

    expect(a?.severity).toBe("crisis");
    expect(b?.severity).toBe("crisis");
    expect(b?.crisisRatio).toBe(a?.crisisRatio);
    expect(b?.involvedTaskNames).toEqual(a?.involvedTaskNames);
  });

  it("does not apply Moment augmentation to the drift tier", () => {
    // A tough moment escalates a real crisis earlier. It must NOT escalate a
    // date the user set for themselves and is free to move.
    const belowLine = driftingTargets().map((t) => ({ ...t, estimatedMinutes: 60 }));
    const result = detectCrisis(
      input({
        tasks: belowLine,
        recentMoments: [
          { type: "tough_moment", intensity: 5, occurredAt: new Date(Date.now() - 60_000) },
        ],
      })
    );
    expect(result).toBeNull();
  });
});

describe("drift hysteresis — the flicker guard", () => {
  /** ~0.78: just BELOW the 0.8 trigger, but ABOVE the 0.7 clear line. */
  const inTheBand = () =>
    driftingTargets().map((t) => ({ ...t, estimatedMinutes: 70 }));

  it("does not start a warning inside the band", () => {
    expect(detectCrisis(input({ tasks: inTheBand(), driftActive: false }))).toBeNull();
  });

  it("keeps an existing warning standing inside the band", () => {
    const result = detectCrisis(input({ tasks: inTheBand(), driftActive: true }));
    expect(result?.severity).toBe("drift");
  });

  it("cannot oscillate: the same workload never flips state tick to tick", () => {
    // Feed each tick's outcome back in as the next tick's driftActive, which is
    // exactly what the cron does. A flickering threshold would alternate.
    const tasks = inTheBand();
    let active = false;
    const states: boolean[] = [];
    for (let tick = 0; tick < 6; tick++) {
      active = detectCrisis(input({ tasks, driftActive: active }))?.severity === "drift";
      states.push(active);
    }
    expect(new Set(states).size).toBe(1);
  });

  it("still clears once the workload drops below the hysteresis floor", () => {
    const clearlyFine = driftingTargets().map((t) => ({ ...t, estimatedMinutes: 20 }));
    expect(detectCrisis(input({ tasks: clearlyFine, driftActive: true }))).toBeNull();
  });
});
