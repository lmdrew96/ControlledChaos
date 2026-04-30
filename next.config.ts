import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  reactCompiler: true,
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
    ];
  },
};

export default nextConfig;
