import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/privacy",
  "/terms",
  "/api/auth(.*)",
  "/api/cron(.*)",
  "/api/calendar/export/(.*)",
  // Reports the running deploy's commit SHA and nothing else. It has to stay
  // reachable for a stale tab whose Clerk session already expired — that tab
  // is precisely the one that needs to be told to reload. Without this entry
  // auth.protect() 404'd the exact case the route exists to serve.
  "/api/version",
  // The VAPID PUBLIC key, already shipped in the client bundle. public/sw.js
  // fetches it on pushsubscriptionchange to re-subscribe, from a context that
  // may have no live Clerk session; gated, it 404'd and that device silently
  // stopped getting push.
  "/api/notifications/vapid-key",
  "/manifest.json",
]);

export default clerkMiddleware(async (auth, request) => {
  // Skip auth protection if Clerk keys aren't configured yet
  if (!process.env.CLERK_SECRET_KEY) {
    return NextResponse.next();
  }

  if (!isPublicRoute(request)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
