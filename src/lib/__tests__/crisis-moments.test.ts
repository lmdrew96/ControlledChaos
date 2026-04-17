import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import {
  detectCrisis,
  type CrisisDetectionInput,
  type DetectionMoment,
} from "../crisis-detection";

// Pin "now" to a weekday mid-morning so deadline windows stay fully inside
// waking hours regardless of when the suite runs. Removes sleep-boundary flakiness.
const FIXED_NOW = new Date("2026-04-15T14:00:00.000Z"); // 10 AM EDT

beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
});

afterAll(() => {
  vi.useRealTimers();
});

/**
 * Crisis detection Moment-augmentation rules.
 *
 * Rules (from patch 1 plan):
 *  1. tough_moment with intensity ≥ 4 in last 60 min → override at ratio > 0.6
 *  2. ≥ 2 tough_moment events in last 2 hours → same override
 *  3. energy_crash in last 30 min → +0.1 ratio bias for threshold comparison
 *
 * Base behavior when recentMoments is empty must be preserved.
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function minutesAgo(mins: number): Date {
  return new Date(Date.now() - mins * 60 * 1000);
}

function hoursAhead(hrs: number): Date {
  return new Date(Date.now() + hrs * 60 * 60 * 1000);
}

/** Produce a baseline input with a SOFT-ratio workload and 1 deadline (won't trigger by itself). */
function softBaselineInput(
  overrides: Partial<CrisisDetectionInput> = {}
): CrisisDetectionInput {
  return {
    // 90 min work / 180 min available = ratio 0.5 — below all thresholds
    tasks: [
      {
        id: "t1",
        title: "Essay",
        deadline: hoursAhead(3),
        estimatedMinutes: 90,
        status: "pending",
      },
    ],
    calendarEvents: [],
    timezone: "America/New_York",
    wakeTime: 7,
    sleepTime: 22,
    detectionWindowHours: 48,
    ...overrides,
  };
}

/** Produce an input just above the 0.6 Moment-override floor (ratio 0.7). */
function borderlineInput(
  overrides: Partial<CrisisDetectionInput> = {}
): CrisisDetectionInput {
  return {
    // 126 min / 180 min = 0.7 — above 0.6 floor, below 0.8 soft and 1.0 hard
    tasks: [
      {
        id: "t1",
        title: "Essay",
        deadline: hoursAhead(3),
        estimatedMinutes: 126,
        status: "pending",
      },
    ],
    calendarEvents: [],
    timezone: "America/New_York",
    wakeTime: 7,
    sleepTime: 22,
    detectionWindowHours: 48,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Base behavior — empty recentMoments must match pre-augmentation behavior
// ---------------------------------------------------------------------------

describe("detectCrisis: base behavior with empty recentMoments", () => {
  it("returns null for a soft-ratio single-deadline workload", () => {
    expect(detectCrisis(softBaselineInput())).toBeNull();
  });

  it("returns null at ratio 0.7 with no augmentation signals", () => {
    expect(detectCrisis(borderlineInput())).toBeNull();
  });

  it("triggers normally when ratio > 1.0 (hard threshold)", () => {
    const result = detectCrisis(
      softBaselineInput({
        tasks: [
          {
            id: "t1",
            title: "Huge",
            deadline: hoursAhead(1),
            estimatedMinutes: 200,
            status: "pending",
          },
        ],
      })
    );
    expect(result).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Rule 1 — tough_moment intensity ≥ 4 in last 60 min
// ---------------------------------------------------------------------------

describe("detectCrisis: Rule 1 — tough_moment ≥ 4 intensity override", () => {
  it("triggers crisis at ratio 0.7 when tough_moment intensity=5 is recent", () => {
    const moments: DetectionMoment[] = [
      { type: "tough_moment", intensity: 5, occurredAt: minutesAgo(20) },
    ];
    const result = detectCrisis(borderlineInput({ recentMoments: moments }));
    expect(result).not.toBeNull();
  });

  it("does NOT trigger at ratio 0.7 when intensity is below 4", () => {
    const moments: DetectionMoment[] = [
      { type: "tough_moment", intensity: 3, occurredAt: minutesAgo(20) },
    ];
    const result = detectCrisis(borderlineInput({ recentMoments: moments }));
    expect(result).toBeNull();
  });

  it("does NOT trigger when the tough_moment is older than 60 min", () => {
    const moments: DetectionMoment[] = [
      { type: "tough_moment", intensity: 5, occurredAt: minutesAgo(90) },
    ];
    const result = detectCrisis(borderlineInput({ recentMoments: moments }));
    expect(result).toBeNull();
  });

  it("does NOT trigger at very low ratio (0.5) even with intensity=5", () => {
    const moments: DetectionMoment[] = [
      { type: "tough_moment", intensity: 5, occurredAt: minutesAgo(10) },
    ];
    // softBaselineInput is ratio 0.5 — below the 0.6 override floor
    const result = detectCrisis(softBaselineInput({ recentMoments: moments }));
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Rule 2 — ≥ 2 tough_moments in last 2 hours
// ---------------------------------------------------------------------------

describe("detectCrisis: Rule 2 — consecutive tough_moments override", () => {
  it("triggers at ratio 0.7 with two tough_moments (any intensity) within 2 hours", () => {
    const moments: DetectionMoment[] = [
      { type: "tough_moment", intensity: 2, occurredAt: minutesAgo(30) },
      { type: "tough_moment", intensity: 1, occurredAt: minutesAgo(100) },
    ];
    const result = detectCrisis(borderlineInput({ recentMoments: moments }));
    expect(result).not.toBeNull();
  });

  it("does NOT trigger when only one tough_moment is recent (rule 1 intensity guard applies)", () => {
    const moments: DetectionMoment[] = [
      { type: "tough_moment", intensity: 2, occurredAt: minutesAgo(30) },
    ];
    const result = detectCrisis(borderlineInput({ recentMoments: moments }));
    expect(result).toBeNull();
  });

  it("does NOT trigger when the second tough_moment is older than 2 hours", () => {
    const moments: DetectionMoment[] = [
      { type: "tough_moment", intensity: 2, occurredAt: minutesAgo(30) },
      { type: "tough_moment", intensity: 1, occurredAt: minutesAgo(180) },
    ];
    const result = detectCrisis(borderlineInput({ recentMoments: moments }));
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Rule 3 — energy_crash in last 30 min biases ratio +0.1
// ---------------------------------------------------------------------------

describe("detectCrisis: Rule 3 — energy_crash bias", () => {
  // Deadlines are bucketed by hour (YYYY-MM-DDTHH) for uniqueness counting,
  // so deadlines must fall in different UTC hours to count as 2 distinct deadlines.
  it("pushes ratio 0.75 over the 0.8 soft threshold when 2 deadlines exist", () => {
    // Base ratio = (60+75) / 180 = 0.75 — below 0.8 soft threshold
    const tasks = [
      {
        id: "t1",
        title: "A",
        deadline: hoursAhead(3),
        estimatedMinutes: 60,
        status: "pending",
      },
      {
        id: "t2",
        title: "B",
        deadline: hoursAhead(4), // Different UTC hour from t1
        estimatedMinutes: 75,
        status: "pending",
      },
    ];
    const withoutCrash = detectCrisis({
      ...softBaselineInput({ tasks }),
    });
    expect(withoutCrash).toBeNull();

    const withCrash = detectCrisis({
      ...softBaselineInput({ tasks }),
      recentMoments: [
        { type: "energy_crash", intensity: null, occurredAt: minutesAgo(10) },
      ],
    });
    // 0.75 + 0.1 = 0.85 > 0.8, 2 deadlines ≥ min → triggers
    expect(withCrash).not.toBeNull();
  });

  it("does NOT apply bias when energy_crash is older than 30 min", () => {
    const tasks = [
      {
        id: "t1",
        title: "A",
        deadline: hoursAhead(3),
        estimatedMinutes: 60,
        status: "pending",
      },
      {
        id: "t2",
        title: "B",
        deadline: hoursAhead(4),
        estimatedMinutes: 75,
        status: "pending",
      },
    ];
    const result = detectCrisis({
      ...softBaselineInput({ tasks }),
      recentMoments: [
        { type: "energy_crash", intensity: null, occurredAt: minutesAgo(60) },
      ],
    });
    expect(result).toBeNull();
  });

  it("stored crisisRatio reflects the real ratio, not the biased one", () => {
    // Ratio 0.95 with 2 deadlines → soft-threshold triggers even without bias
    const tasks = [
      {
        id: "t1",
        title: "A",
        deadline: hoursAhead(3),
        estimatedMinutes: 90,
        status: "pending",
      },
      {
        id: "t2",
        title: "B",
        deadline: hoursAhead(4),
        estimatedMinutes: 81,
        status: "pending",
      },
    ];
    const result = detectCrisis({
      ...softBaselineInput({ tasks }),
      recentMoments: [
        { type: "energy_crash", intensity: null, occurredAt: minutesAgo(10) },
      ],
    });
    expect(result).not.toBeNull();
    // Real ratio = 171/180 = 0.95 — NOT 1.05 (the biased value)
    expect(result!.crisisRatio).toBeCloseTo(0.95, 1);
  });
});
