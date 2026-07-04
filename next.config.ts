import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server bundle for container deploys (see Dockerfile).
  output: "standalone",
  poweredByHeader: false,
};

export default nextConfig;
