import type { NextConfig } from "next";

const config: NextConfig = process.env.NODE_ENV === "development" ? {
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${process.env.API_PROXY_URL || "http://127.0.0.1:8000"}/api/:path*` }];
  },
} : { output: "export" };
export default config;
