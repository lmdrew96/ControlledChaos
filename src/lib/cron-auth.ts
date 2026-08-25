import { Receiver } from "@upstash/qstash";

let receiver: Receiver | null | undefined;

function getReceiver(): Receiver | null {
  if (receiver !== undefined) return receiver;
  const currentSigningKey = process.env.QSTASH_CURRENT_SIGNING_KEY;
  const nextSigningKey = process.env.QSTASH_NEXT_SIGNING_KEY;
  receiver = currentSigningKey && nextSigningKey ? new Receiver({ currentSigningKey, nextSigningKey }) : null;
  return receiver;
}

/**
 * Authenticate an inbound cron request.
 *
 * Accepts either a QStash-signed request (the scheduler in production —
 * signing keys rotate and the signature is tied to this exact destination
 * URL) or the static CRON_SECRET bearer token (manual curl / local dev,
 * where there's no QStash signature to check).
 */
export async function verifyCronRequest(request: Request, rawBody: string): Promise<boolean> {
  const signature = request.headers.get("upstash-signature");
  if (signature) {
    const client = getReceiver();
    if (!client) return false;
    try {
      return await client.verify({ signature, body: rawBody, url: request.url });
    } catch {
      return false;
    }
  }

  const authHeader = request.headers.get("authorization");
  return authHeader === `Bearer ${process.env.CRON_SECRET}`;
}
