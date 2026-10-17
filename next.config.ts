import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  allowedDevOrigins: [
    "ais-dev-2mpab52lrojzw6pq5vifa7-99861227484.us-west2.run.app",
    "ais-pre-2mpab52lrojzw6pq5vifa7-99861227484.us-west2.run.app",
    "*.run.app",
    "localhost:3000",
    "127.0.0.1:3000",
  ],
};

export default nextConfig;
