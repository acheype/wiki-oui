import type { NextConfig } from "next";
import { wikiConfig } from "./wiki.config";

const nextConfig: NextConfig = {
  // A stray lockfile in the home directory makes Next mis-infer the root.
  turbopack: { root: import.meta.dirname },
  async redirects() {
    return [
      {
        source: "/",
        destination: `/${wikiConfig.homeSlug}`,
        permanent: false, // the home slug is configurable (ADR 0001); a 308 would outlive a config change
      },
    ];
  },
};

export default nextConfig;
