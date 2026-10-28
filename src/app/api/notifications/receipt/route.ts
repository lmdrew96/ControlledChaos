import { NextResponse } from "next/server";
import { recordPushReceipt } from "@/lib/db/queries";
import { verifyReceiptToken } from "@/lib/notifications/receipt-token";

/**
 * POST /api/notifications/receipt
 * The service worker reports that a push reached this device. Public (the SW
 * may have no Clerk session), so the only authority is the signed receiptToken
 * minted into that push. The time recorded is the server's, not the device's.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { token } = (body ?? {}) as { token?: unknown };
  const claims = typeof token === "string" ? verifyReceiptToken(token) : null;
  if (!claims) {
    return NextResponse.json({ error: "Invalid receipt token" }, { status: 401 });
  }

  try {
    await recordPushReceipt({
      ...claims,
      userAgent: request.headers.get("user-agent")?.slice(0, 300) ?? null,
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Receipt] Failed to record push receipt:", error);
    return NextResponse.json({ error: "Failed to record receipt" }, { status: 500 });
  }
}
