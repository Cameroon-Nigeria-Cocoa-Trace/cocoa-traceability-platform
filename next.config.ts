import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  allowedDevOrigins: [
    "ais-dev-st5vylp6my67vnd2h5z6r5-738691926329.europe-west2.run.app",
    "ais-pre-st5vylp6my67vnd2h5z6r5-738691926329.europe-west2.run.app",
    "ais-dev-2o76zcshq75wcv7jnmsxng-920952718204.europe-west2.run.app",
    "ais-pre-2o76zcshq75wcv7jnmsxng-920952718204.europe-west2.run.app",
    "*.run.app",
    "localhost:3000",
    "127.0.0.1:3000",
  ],
};

export default nextConfig;
