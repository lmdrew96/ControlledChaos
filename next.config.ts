import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  reactCompiler: true,
  turbopack: {
    root: path.resolve(__dirname),
  },
  serverExternalPackages: ["node-ical", "@react-email/components", "resend"],
};

export default nextConfig;
