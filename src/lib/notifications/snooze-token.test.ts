import { describe, it, expect, beforeAll } from "vitest";
import { mintSnoozeToken, verifySnoozeToken } from "./snooze-token";

beforeAll(() => {
  process.env.VAPID_PRIVATE_KEY = "test-secret";
});

describe("snooze token", () => {
  const claims = { userId: "user_a", taskId: "task-1", tag: "deadline-task-1-30" };

  it("round-trips its claims", () => {
    expect(verifySnoozeToken(mintSnoozeToken(claims))).toEqual(claims);
  });

  it("rejects a token whose claims were edited", () => {
    const [, sig] = mintSnoozeToken(claims).split(".");
    const forged = Buffer.from(
      JSON.stringify({ u: "user_b", k: "task-1", exp: Date.now() + 60_000 })
    ).toString("base64url");
    expect(verifySnoozeToken(`${forged}.${sig}`)).toBeNull();
  });

  it("rejects an expired token", () => {
    const t = mintSnoozeToken(claims, Date.now() - 25 * 60 * 60 * 1000);
    expect(verifySnoozeToken(t)).toBeNull();
  });

  it("rejects a token signed with another secret", () => {
    const t = mintSnoozeToken(claims);
    process.env.VAPID_PRIVATE_KEY = "rotated";
    expect(verifySnoozeToken(t)).toBeNull();
    process.env.VAPID_PRIVATE_KEY = "test-secret";
  });

  it("rejects garbage", () => {
    expect(verifySnoozeToken("")).toBeNull();
    expect(verifySnoozeToken("a.b.c")).toBeNull();
    expect(verifySnoozeToken("nodot")).toBeNull();
  });
});
