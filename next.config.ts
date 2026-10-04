import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  allowedDevOrigins: [
    "ais-dev-2o76zcshq75wcv7jnmsxng-920952718204.europe-west2.run.app",
    "ais-pre-2o76zcshq75wcv7jnmsxng-920952718204.europe-west2.run.app",
    "localhost:3000",
    "127.0.0.1:3000",
  ],
};

export default nextConfig;
