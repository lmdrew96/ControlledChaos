import webpush from "web-push";

let configured = false;

/**
 * The web-push client with VAPID details set, configured on first use.
 *
 * This used to run at module scope, so every build (which imports route
 * modules without runtime secrets) logged "[Push] VAPID keys missing" three
 * times: a false alarm that looked like a failure. Now the check runs when a
 * push is actually sent, and a missing key is a clear error there.
 */
export function getWebPush(): typeof webpush {
  if (configured) return webpush;

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    throw new Error(
      "VAPID keys missing: set NEXT_PUBLIC_VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY."
    );
  }

  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT ?? "mailto:nae@adhdesigns.dev",
    publicKey,
    privateKey
  );
  configured = true;
  return webpush;
}
