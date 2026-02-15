import { clerkClient } from "@clerk/nextjs/server";

export interface GoogleAccountToken {
  token: string;
  /** Clerk external account ID — used to distinguish multiple Google accounts */
  accountId: string;
  /** Email of the Google account (if available from Clerk external accounts) */
  email: string | null;
}

/**
 * Get OAuth access tokens for ALL connected Google accounts.
 * Clerk automatically handles token refresh.
 */
export async function getAllGoogleAccessTokens(
  userId: string
): Promise<GoogleAccountToken[]> {
  try {
    const client = await clerkClient();

    // Get the user to access external accounts for email info
    const user = await client.users.getUser(userId);
    const googleAccounts = user.externalAccounts.filter(
      (ea) => ea.provider === "google"
    );

    const tokenResponse = await client.users.getUserOauthAccessToken(
      userId,
      "oauth_google"
    );

    if (!tokenResponse.data || tokenResponse.data.length === 0) {
      return [];
    }

    // Map tokens to accounts by index (Clerk returns them in the same order)
    return tokenResponse.data.map((tokenData, i) => ({
      token: tokenData.token,
      accountId: googleAccounts[i]?.id ?? `google-${i}`,
      email: googleAccounts[i]?.emailAddress ?? null,
    }));
  } catch (error) {
    console.error("[Google Auth] Failed to get access tokens:", error);
    return [];
  }
}

/**
 * Get the first Google OAuth access token (backward compat).
 * Returns null if the user hasn't connected Google.
 */
export async function getGoogleAccessToken(
  userId: string
): Promise<string | null> {
  const tokens = await getAllGoogleAccessTokens(userId);
  return tokens.length > 0 ? tokens[0].token : null;
}
