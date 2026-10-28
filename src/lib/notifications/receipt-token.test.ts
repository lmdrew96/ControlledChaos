import { describe, it, expect, beforeAll } from "vitest";
import { mintReceiptToken, verifyReceiptToken } from "./receipt-token";
import { mintSnoozeToken } from "./snooze-token";

beforeAll(() => {
  process.env.VAPID_PRIVATE_KEY = "test-secret";
});

describe("receipt token", () => {
  const claims = { userId: "user_a", notificationId: "notif-1", subscriptionId: "sub-1" };

  it("round-trips its claims", () => {
    expect(verifyReceiptToken(mintReceiptToken(claims))).toEqual(claims);
  });

  it("rejects a token whose claims were edited", () => {
    const [, sig] = mintReceiptToken(claims).split(".");
    const forged = Buffer.from(
      JSON.stringify({ u: "user_b", n: "notif-1", s: "sub-1", exp: Date.now() + 60_000 })
    ).toString("base64url");
    expect(verifyReceiptToken(`${forged}.${sig}`)).toBeNull();
  });

  it("rejects an expired token", () => {
    const t = mintReceiptToken(claims, Date.now() - 8 * 24 * 60 * 60 * 1000);
    expect(verifyReceiptToken(t)).toBeNull();
  });

  it("rejects a snooze token", () => {
    expect(
      verifyReceiptToken(mintSnoozeToken({ userId: "user_a", taskId: "notif-1" }))
    ).toBeNull();
  });

  it("rejects garbage", () => {
    expect(verifyReceiptToken("")).toBeNull();
    expect(verifyReceiptToken("a.b.c")).toBeNull();
  });
});
