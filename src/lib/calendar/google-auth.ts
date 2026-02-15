import { clerkClient } from "@clerk/nextjs/server";

/**
 * Get the user's Google OAuth access token from Clerk.
 * Returns null if the user hasn't connected Google.
 * Clerk automatically handles token refresh.
 */
export async function getGoogleAccessToken(
  userId: string
): Promise<string | null> {
  try {
    const client = await clerkClient();
    const tokenResponse = await client.users.getUserOauthAccessToken(
      userId,
      "oauth_google"
    );

    if (!tokenResponse.data || tokenResponse.data.length === 0) {
      return null;
    }

    return tokenResponse.data[0].token;
  } catch (error) {
    console.error("[Google Auth] Failed to get access token:", error);
    return null;
  }
}
