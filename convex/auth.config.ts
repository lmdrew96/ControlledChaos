// Clerk → Convex auth bridge.
// CLERK_JWT_ISSUER_DOMAIN must be set in Convex env (matches Clerk Frontend API URL,
// e.g. https://clerk.adhdesigns.dev or https://<slug>.clerk.accounts.dev).
// The "convex" JWT template must exist in the Clerk dashboard.

export default {
  providers: [
    {
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN,
      applicationID: "convex",
    },
  ],
};
