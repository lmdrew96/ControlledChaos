import type { NextConfig } from "next";
import path from "path";

// Baked into the client bundle at build time and served fresh by
// /api/version. A tab compares the two to notice it is running stale JS.
// Commit SHA when Vercel provides one (changes every deploy); the package
// version is the local/dev fallback.
const APP_VERSION =
  process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ??
  process.env.npm_package_version ??
  "dev";

const nextConfig: NextConfig = {
  reactCompiler: true,
  env: {
    NEXT_PUBLIC_APP_VERSION: APP_VERSION,
  },
  turbopack: {
    root: path.resolve(__dirname),
  },
  serverExternalPackages: ["node-ical", "@react-email/components", "resend", "web-push"],
  async redirects() {
    return [
      // Mirror → Daily Recap rename. Permanent redirect so existing
      // bookmarks, push-notification deep-links, etc. land in the right place.
      { source: "/mirror", destination: "/recap", permanent: true },
      { source: "/mirror/:path*", destination: "/recap/:path*", permanent: true },
      // Journal merged into the Brain Dump screen as a category toggle.
      { source: "/journal", destination: "/dump?category=junk_journal", permanent: true },
      // Momentum folded into a collapsible section on the dashboard.
      { source: "/momentum", destination: "/dashboard#momentum-panel", permanent: true },
    ];
  },
};

export default nextConfig;
